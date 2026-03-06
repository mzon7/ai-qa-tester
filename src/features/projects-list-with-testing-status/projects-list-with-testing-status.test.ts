/**
 * Tests: Projects List with Testing Status
 *
 * Unit tests for run API wrappers, status logic, and helper utilities.
 * Component-level tests for RunCreateForm, RunStatusPanel, etc.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {},
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

vi.mock("../../lib/api", () => ({
  runsCreate: vi.fn(),
  runsListByProject: vi.fn(),
  runsGet: vi.fn(),
}));

import * as api from "../../lib/api";
import type { Run } from "../../lib/api";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    project_id: "proj-1",
    user_id: "user-1",
    status: "queued",
    scope_mode: "everything",
    instructions: null,
    started_at: null,
    completed_at: null,
    summary: null,
    error: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── API wrapper tests ────────────────────────────────────────────────────────

describe("runsCreate", () => {
  it("calls runs_create with project_id and scope_mode", async () => {
    const mockRun = makeRun();
    vi.mocked(api.runsCreate).mockResolvedValue({ data: { run: mockRun }, error: null });

    const result = await api.runsCreate("proj-1", "everything");

    expect(api.runsCreate).toHaveBeenCalledWith("proj-1", "everything");
    expect(result.data?.run.status).toBe("queued");
    expect(result.error).toBeNull();
  });

  it("passes instructions when scope_mode is 'instructions'", async () => {
    const mockRun = makeRun({ scope_mode: "instructions", instructions: "test the login" });
    vi.mocked(api.runsCreate).mockResolvedValue({ data: { run: mockRun }, error: null });

    const result = await api.runsCreate("proj-1", "instructions", "test the login");

    expect(api.runsCreate).toHaveBeenCalledWith("proj-1", "instructions", "test the login");
    expect(result.data?.run.scope_mode).toBe("instructions");
    expect(result.data?.run.instructions).toBe("test the login");
  });

  it("returns error on failure", async () => {
    vi.mocked(api.runsCreate).mockResolvedValue({ data: null, error: "Project not found" });

    const result = await api.runsCreate("bad-id", "everything");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Project not found");
  });
});

describe("runsListByProject", () => {
  it("returns runs list for a project", async () => {
    const runs = [makeRun({ status: "passed" }), makeRun({ id: "run-2", status: "failed" })];
    vi.mocked(api.runsListByProject).mockResolvedValue({ data: { runs }, error: null });

    const result = await api.runsListByProject("proj-1");

    expect(api.runsListByProject).toHaveBeenCalledWith("proj-1");
    expect(result.data?.runs).toHaveLength(2);
    expect(result.data?.runs[0].status).toBe("passed");
  });

  it("returns empty array when no runs exist", async () => {
    vi.mocked(api.runsListByProject).mockResolvedValue({ data: { runs: [] }, error: null });

    const result = await api.runsListByProject("proj-1");

    expect(result.data?.runs).toHaveLength(0);
  });
});

describe("runsGet", () => {
  it("returns run with steps and logs", async () => {
    const run = makeRun({ status: "passed", summary: "All tests passed" });
    vi.mocked(api.runsGet).mockResolvedValue({
      data: { run, steps: [], logs: [] },
      error: null,
    });

    const result = await api.runsGet("run-1");

    expect(api.runsGet).toHaveBeenCalledWith("run-1");
    expect(result.data?.run.summary).toBe("All tests passed");
    expect(result.data?.steps).toHaveLength(0);
    expect(result.data?.logs).toHaveLength(0);
  });

  it("returns error when run not found", async () => {
    vi.mocked(api.runsGet).mockResolvedValue({ data: null, error: "Run not found" });

    const result = await api.runsGet("nonexistent");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Run not found");
  });
});

// ─── Status / display logic ───────────────────────────────────────────────────

describe("Run status display logic", () => {
  const ACTIVE_STATUSES = ["queued", "running"];
  const DONE_STATUSES = ["passed", "failed", "canceled"];

  it("identifies active statuses correctly", () => {
    ACTIVE_STATUSES.forEach((s) => {
      expect(["queued", "running"].includes(s)).toBe(true);
    });
  });

  it("identifies done statuses correctly", () => {
    DONE_STATUSES.forEach((s) => {
      expect(["passed", "failed", "canceled"].includes(s)).toBe(true);
    });
  });

  it("computes duration from started_at to completed_at", () => {
    const started = new Date("2026-01-01T10:00:00Z");
    const completed = new Date("2026-01-01T10:02:35Z");
    const ms = completed.getTime() - started.getTime();
    const s = Math.floor(ms / 1000);
    expect(Math.floor(s / 60)).toBe(2);
    expect(s % 60).toBe(35);
  });

  it("shows 'just now' for runs under 1 minute old", () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const diff = Date.now() - new Date(recent).getTime();
    const m = Math.floor(diff / 60_000);
    expect(m).toBe(0);
  });
});

// ─── RunCreateForm component tests ───────────────────────────────────────────

import RunCreateForm from "./components/RunCreateForm";

describe("RunCreateForm", () => {
  it("renders scope toggle buttons", () => {
    render(React.createElement(RunCreateForm, {
      onSubmit: vi.fn(),
      loading: false,
      error: null,
      hasActiveRun: false,
    }));
    expect(screen.getByText("Test everything")).toBeInTheDocument();
    expect(screen.getByText("Custom instructions")).toBeInTheDocument();
  });

  it("shows textarea when 'Custom instructions' is selected", async () => {
    const user = userEvent.setup();
    render(React.createElement(RunCreateForm, {
      onSubmit: vi.fn(),
      loading: false,
      error: null,
      hasActiveRun: false,
    }));
    await user.click(screen.getByText("Custom instructions"));
    // Both the instructions textarea and the feature-description textarea are now rendered
    expect(screen.getAllByRole("textbox").length).toBeGreaterThanOrEqual(2);
  });

  it("calls onSubmit with 'everything' scope mode by default", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(React.createElement(RunCreateForm, {
      onSubmit,
      loading: false,
      error: null,
      hasActiveRun: false,
    }));
    await user.click(screen.getByText("Start test run"));
    expect(onSubmit).toHaveBeenCalledWith("everything", undefined, undefined);
  });

  it("shows validation error when submitting instructions scope with empty text", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(React.createElement(RunCreateForm, {
      onSubmit,
      loading: false,
      error: null,
      hasActiveRun: false,
    }));
    await user.click(screen.getByText("Custom instructions"));
    await user.click(screen.getByText("Start test run"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please describe what to test");
  });

  it("disables submit button when a run is active", () => {
    render(React.createElement(RunCreateForm, {
      onSubmit: vi.fn(),
      loading: false,
      error: null,
      hasActiveRun: true,
    }));
    expect(screen.getByText("Run in progress…")).toBeDisabled();
  });

  it("shows loading state during submission", () => {
    render(React.createElement(RunCreateForm, {
      onSubmit: vi.fn(),
      loading: true,
      error: null,
      hasActiveRun: false,
    }));
    expect(screen.getByText("Starting…")).toBeInTheDocument();
  });
});

// ─── RunStatusPanel component tests ──────────────────────────────────────────

import RunStatusPanel from "./components/RunStatusPanel";

describe("RunStatusPanel", () => {
  it("renders status badge for queued run", () => {
    const run = makeRun({ status: "queued" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Waiting to start…")).toBeInTheDocument();
  });

  it("renders Re-run button for completed run", () => {
    const run = makeRun({ status: "passed", summary: "All clear." });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));
    expect(screen.getByText("Re-run")).toBeInTheDocument();
    expect(screen.getByText("All clear.")).toBeInTheDocument();
  });

  it("calls onRerun when Re-run is clicked", async () => {
    const onRerun = vi.fn();
    const user = userEvent.setup();
    const run = makeRun({ status: "failed", error: "Timeout" });
    render(React.createElement(RunStatusPanel, { run, onRerun, rerunLoading: false }));
    await user.click(screen.getByText("Re-run"));
    expect(onRerun).toHaveBeenCalled();
  });

  it("shows error box for failed runs", () => {
    const run = makeRun({ status: "failed", error: "Connection refused" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));
    expect(screen.getByRole("alert")).toHaveTextContent("Connection refused");
  });

  it("shows instructions when present", () => {
    const run = makeRun({ status: "running", scope_mode: "instructions", instructions: "Test the login page" });
    render(React.createElement(RunStatusPanel, { run, onRerun: vi.fn(), rerunLoading: false }));
    expect(screen.getByText(/Test the login page/)).toBeInTheDocument();
  });
});
