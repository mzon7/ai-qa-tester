/**
 * Tests: Monitor Active Run Status and Logs
 *
 * Unit tests for useRunStream hook behaviour:
 *   - stays idle when no runId or enabled=false
 *   - builds the correct SSE URL with auth token
 *   - handles status / steps / log / done / error events
 *   - cleans up EventSource on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

// Provide VITE_SUPABASE_URL for the hook module
vi.stubGlobal("import.meta", {
  env: { VITE_SUPABASE_URL: "https://test.supabase.co" },
});

import { supabase } from "../../lib/supabase";

// ─── Minimal EventSource mock ─────────────────────────────────────────────────

type ESListener = (e: MessageEvent) => void;

class MockEventSource {
  url: string;
  static instances: MockEventSource[] = [];
  listeners: Record<string, ESListener[]> = {};
  onerror: ((e: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: ESListener) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(fn);
  }

  emit(type: string, data: unknown) {
    const msg = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners[type] ?? []) fn(msg);
  }

  close() {
    this.closed = true;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useRunStream — URL construction", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-abc" } },
      error: null,
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not open EventSource when runId is null", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useRunStream } = await import("./lib/useRunStream");

    const { result } = renderHook(() => useRunStream(null, true));
    expect(result.current.streamStatus).toBe("idle");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("does not open EventSource when enabled is false", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useRunStream } = await import("./lib/useRunStream");

    const { result } = renderHook(() => useRunStream("run-1", false));
    expect(result.current.streamStatus).toBe("idle");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("opens EventSource with correct URL and token", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useRunStream } = await import("./lib/useRunStream");

    renderHook(() => useRunStream("run-123", true));
    // Allow the async connect() to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("runId=run-123");
    expect(es.url).toContain("token=tok-abc");
    expect(es.url).toContain("/functions/v1/runs_stream");
  });
});

describe("useRunStream — event handling", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok-abc" } },
      error: null,
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup(runId = "run-1") {
    const { renderHook, act } = await import("@testing-library/react");
    const { useRunStream } = await import("./lib/useRunStream");
    const hook = renderHook(() => useRunStream(runId, true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const es = MockEventSource.instances[0];
    return { hook, es, act };
  }

  it("updates runPatch on status event", async () => {
    const { hook, es, act } = await setup();
    await act(async () => {
      // Trigger open first so streamStatus becomes "streaming"
      for (const fn of es.listeners["open"] ?? []) fn({} as MessageEvent);
      es.emit("status", {
        runId: "run-1",
        status: "running",
        summary: null,
        error: null,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: null,
      });
    });
    expect(hook.result.current.runPatch?.status).toBe("running");
    expect(hook.result.current.streamStatus).toBe("streaming");
  });

  it("replaces steps on steps event", async () => {
    const { hook, es, act } = await setup();
    const stepPayload = [
      { id: "s1", run_id: "run-1", idx: 0, title: "Load page", expected: null, status: "passed", notes: null, started_at: null, completed_at: null },
    ];
    await act(async () => {
      es.emit("steps", { steps: stepPayload });
    });
    expect(hook.result.current.steps).toHaveLength(1);
    expect(hook.result.current.steps[0].title).toBe("Load page");
  });

  it("appends logs on log events", async () => {
    const { hook, es, act } = await setup();
    await act(async () => {
      es.emit("log", { log: { id: "l1", run_id: "run-1", ts: "2026-01-01T00:00:01Z", level: "info", message: "Starting", step_id: null } });
      es.emit("log", { log: { id: "l2", run_id: "run-1", ts: "2026-01-01T00:00:02Z", level: "warn", message: "Slow load", step_id: null } });
    });
    expect(hook.result.current.logs).toHaveLength(2);
    expect(hook.result.current.logs[1].message).toBe("Slow load");
  });

  it("sets streamStatus to done on done event", async () => {
    const { hook, es, act } = await setup();
    await act(async () => {
      es.emit("done", { status: "passed" });
    });
    expect(hook.result.current.streamStatus).toBe("done");
  });

  it("sets streamStatus to error on error event", async () => {
    const { hook, es, act } = await setup();
    await act(async () => {
      es.emit("error", { message: "Connection reset" });
    });
    expect(hook.result.current.streamStatus).toBe("error");
    expect(hook.result.current.streamError).toBe("Connection reset");
  });

  it("sets streamStatus to error when not authenticated", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    const { renderHook, act } = await import("@testing-library/react");
    const { useRunStream } = await import("./lib/useRunStream");
    const hook = renderHook(() => useRunStream("run-1", true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(hook.result.current.streamStatus).toBe("error");
    expect(hook.result.current.streamError).toBe("Not authenticated");
  });
});
