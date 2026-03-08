/**
 * Tests: Monitor Active Run Status and Logs
 *
 * Component-level tests for RunStatusPanel with mocked useRunSSE:
 *   1. Live status changes — steps and logs rendered from SSE data
 *   2. Worker/run crash — terminal status triggers failure banner + onTerminal callback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../lib/sse", () => ({
  useRunSSE: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

import * as sseModule from "../../lib/sse";
import type { Run } from "../../lib/api";
import RunStatusPanel from "../../features/projects-list-with-testing-status/components/RunStatusPanel";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    project_id: "proj-1",
    user_id: "user-1",
    status: "running",
    scope_mode: "everything",
    instructions: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    summary: null,
    error: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeStep(overrides: object = {}) {
  return {
    id: "step-1",
    run_id: "run-1",
    idx: 0,
    title: "Load home page",
    expected: null,
    status: "passed" as const,
    notes: null,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function makeLog(overrides: object = {}) {
  return {
    id: "log-1",
    run_id: "run-1",
    ts: new Date().toISOString(),
    level: "info" as const,
    message: "Browser launched",
    step_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test 1: Live status changes ──────────────────────────────────────────────

describe("Monitor active run status — live status changes", () => {
  it("renders step progress bar and log lines from SSE data", () => {
    const steps = [
      makeStep({ id: "s1", idx: 0, title: "Load home page", status: "passed" }),
      makeStep({ id: "s2", idx: 1, title: "Click login button", status: "running" }),
      makeStep({ id: "s3", idx: 2, title: "Submit form", status: "pending" }),
    ];
    const logs = [
      makeLog({ id: "l1", message: "Browser launched", level: "info" }),
      makeLog({ id: "l2", message: "Page loaded successfully", level: "info" }),
    ];

    vi.mocked(sseModule.useRunSSE).mockReturnValue({
      sseStatus: { status: "running", summary: null, error: null, started_at: null, completed_at: null },
      sseLogs: logs,
      sseSteps: steps,
      sseConnected: true,
    });

    const run = makeRun({ status: "running" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));

    // Status badge shows Running
    expect(screen.getByText("Running")).toBeInTheDocument();

    // Connection indicator shows Live
    expect(screen.getByText("Live")).toBeInTheDocument();

    // Current running step title is displayed
    expect(screen.getByText("Click login button")).toBeInTheDocument();

    // Log messages are rendered
    expect(screen.getByText("Browser launched")).toBeInTheDocument();
    expect(screen.getByText("Page loaded successfully")).toBeInTheDocument();

    // Log count badge
    expect(screen.getByText("2 lines")).toBeInTheDocument();

    // Step counts: 1 passed, 2 pending (running step counts as pending in pendingSteps)
    expect(screen.getByText(/1 passed/)).toBeInTheDocument();
  });

  it("shows indeterminate progress bar when no steps yet", () => {
    vi.mocked(sseModule.useRunSSE).mockReturnValue({
      sseStatus: { status: "running", summary: null, error: null, started_at: null, completed_at: null },
      sseLogs: [],
      sseSteps: [],
      sseConnected: true,
    });

    const run = makeRun({ status: "running" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));

    // The indeterminate progress bar is shown (progressbar role is present)
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows Polling badge when SSE is not yet connected", () => {
    vi.mocked(sseModule.useRunSSE).mockReturnValue({
      sseStatus: null,
      sseLogs: [],
      sseSteps: [],
      sseConnected: false,
    });

    const run = makeRun({ status: "queued" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));

    expect(screen.getByText("Polling")).toBeInTheDocument();
  });
});

// ─── Test 2: Worker/run crash ─────────────────────────────────────────────────

describe("Monitor active run status — worker/run crash", () => {
  it("shows failure banner when SSE reports failed status", () => {
    vi.mocked(sseModule.useRunSSE).mockReturnValue({
      sseStatus: { status: "failed", summary: null, error: null, started_at: null, completed_at: null },
      sseLogs: [],
      sseSteps: [],
      sseConnected: false,
    });

    // The run prop already reflects the terminal status (after onTerminal fires parent refresh)
    const run = makeRun({ status: "failed", error: "Worker process crashed" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));

    // Status badge shows Failed
    expect(screen.getByText("Failed")).toBeInTheDocument();

    // Error box is rendered
    expect(screen.getByRole("alert")).toHaveTextContent("Worker process crashed");

    // Re-run button is shown for terminal state
    expect(screen.getByText("Re-run")).toBeInTheDocument();
  });

  it("calls onTerminal callback when run reaches terminal status", () => {
    const onTerminal = vi.fn();

    // Simulate SSE firing the terminal callback immediately on mount
    vi.mocked(sseModule.useRunSSE).mockImplementation((_runId, terminalCallback) => {
      // Simulate the hook calling onTerminal synchronously (simplified)
      if (terminalCallback) terminalCallback();
      return {
        sseStatus: { status: "failed", summary: null, error: null, started_at: null, completed_at: null },
        sseLogs: [],
        sseSteps: [],
        sseConnected: false,
      };
    });

    const run = makeRun({ status: "running" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false, onTerminal }));

    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("shows Re-run button after run fails and hides the active pulse", () => {
    vi.mocked(sseModule.useRunSSE).mockReturnValue({
      sseStatus: { status: "failed", summary: null, error: null, started_at: null, completed_at: null },
      sseLogs: [],
      sseSteps: [],
      sseConnected: false,
    });

    const run = makeRun({ status: "failed", error: "Timeout after 120s" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));

    // Re-run button present
    expect(screen.getByText("Re-run")).toBeInTheDocument();

    // Active pulse ("Waiting to start…" / "Running tests…") should NOT be shown
    expect(screen.queryByText("Waiting to start…")).not.toBeInTheDocument();
    expect(screen.queryByText("Running tests…")).not.toBeInTheDocument();
  });
});
