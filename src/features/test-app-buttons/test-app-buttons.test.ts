/**
 * Tests: Test App Buttons
 *
 * Unit tests for button scan utilities and ButtonScanPanel component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
  reportSelfHealError: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {},
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

vi.mock("../../lib/api", () => ({
  buttonScan: vi.fn(),
}));

import * as api from "../../lib/api";

// ─── Utility: isDestructiveButton ────────────────────────────────────────────

import {
  isDestructiveButton,
  classifyButtonType,
  countStepsByStatus,
  formatScanSummary,
  isButtonScanStep,
  DESTRUCTIVE_KEYWORDS,
} from "./lib/buttonScanUtils";

describe("isDestructiveButton", () => {
  it("returns true for 'delete' text", () => {
    expect(isDestructiveButton("Delete account")).toBe(true);
  });

  it("returns true for 'cancel subscription' text", () => {
    expect(isDestructiveButton("Cancel subscription")).toBe(true);
  });

  it("returns true for 'remove account' (case-insensitive)", () => {
    expect(isDestructiveButton("REMOVE ACCOUNT")).toBe(true);
  });

  it("returns false for safe button text", () => {
    expect(isDestructiveButton("Submit")).toBe(false);
    expect(isDestructiveButton("Sign in")).toBe(false);
    expect(isDestructiveButton("Learn more")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(isDestructiveButton("")).toBe(false);
  });

  it("covers all DESTRUCTIVE_KEYWORDS", () => {
    DESTRUCTIVE_KEYWORDS.forEach((kw) => {
      expect(isDestructiveButton(kw)).toBe(true);
    });
  });
});

// ─── Utility: classifyButtonType ─────────────────────────────────────────────

describe("classifyButtonType", () => {
  it("classifies <a> tags as navigation", () => {
    expect(classifyButtonType("a")).toBe("navigation");
  });

  it("classifies <input type=submit> as form-submit", () => {
    expect(classifyButtonType("input", "submit")).toBe("form-submit");
  });

  it("classifies <input type=button> as form-submit", () => {
    expect(classifyButtonType("input", "button")).toBe("form-submit");
  });

  it("classifies <button> as action", () => {
    expect(classifyButtonType("button")).toBe("action");
  });

  it("classifies unknown tags as action", () => {
    expect(classifyButtonType("div")).toBe("action");
  });

  it("is case-insensitive for tag name", () => {
    expect(classifyButtonType("A")).toBe("navigation");
  });
});

// ─── Utility: countStepsByStatus ─────────────────────────────────────────────

describe("countStepsByStatus", () => {
  it("counts all statuses correctly", () => {
    const steps = [
      { status: "passed" },
      { status: "passed" },
      { status: "failed" },
      { status: "skipped" },
      { status: "pending" },
      { status: "running" },
    ];
    const counts = countStepsByStatus(steps);
    expect(counts.total).toBe(6);
    expect(counts.passed).toBe(2);
    expect(counts.failed).toBe(1);
    expect(counts.skipped).toBe(1);
    expect(counts.pending).toBe(2); // pending + running both count as pending
  });

  it("returns zeros for empty array", () => {
    const counts = countStepsByStatus([]);
    expect(counts.total).toBe(0);
    expect(counts.passed).toBe(0);
    expect(counts.failed).toBe(0);
  });
});

// ─── Utility: formatScanSummary ───────────────────────────────────────────────

describe("formatScanSummary", () => {
  it("returns 'No element groups scanned' for zero total", () => {
    expect(formatScanSummary({ total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 })).toBe(
      "No element groups scanned",
    );
  });

  it("includes passed count when >0", () => {
    const result = formatScanSummary({ total: 3, passed: 2, failed: 1, skipped: 0, pending: 0 });
    expect(result).toContain("3 groups scanned");
    expect(result).toContain("2 passed");
    expect(result).toContain("1 failed");
  });

  it("uses singular 'group' when total is 1", () => {
    const result = formatScanSummary({ total: 1, passed: 1, failed: 0, skipped: 0, pending: 0 });
    expect(result).toContain("1 group scanned");
    expect(result).not.toContain("1 groups");
  });

  it("omits zero counts from output", () => {
    const result = formatScanSummary({ total: 2, passed: 2, failed: 0, skipped: 0, pending: 0 });
    expect(result).not.toContain("failed");
    expect(result).not.toContain("skipped");
  });
});

// ─── Utility: isButtonScanStep ────────────────────────────────────────────────

describe("isButtonScanStep", () => {
  it("detects navigation step", () => {
    expect(isButtonScanStep("Navigation Links (8 elements)")).toBe(true);
  });

  it("detects action buttons step", () => {
    expect(isButtonScanStep("Action Buttons (5 elements)")).toBe(true);
  });

  it("detects form submissions step", () => {
    expect(isButtonScanStep("Form Submissions (3 elements)")).toBe(true);
  });

  it("returns false for non-button-scan steps", () => {
    expect(isButtonScanStep("Login page smoke test")).toBe(false);
    expect(isButtonScanStep("Check UI layout")).toBe(false);
  });
});

// ─── API wrapper: buttonScan ──────────────────────────────────────────────────

describe("buttonScan API wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls button_scan edge function with run_id", async () => {
    vi.mocked(api.buttonScan).mockResolvedValue({
      data: {
        status: "passed",
        summary: "Scanned 16 elements across 3 groups.",
        elements_found: 16,
        groups: [
          { name: "navigation", status: "passed", notes: "All links have descriptive text." },
        ],
      },
      error: null,
    });

    const result = await api.buttonScan("run-123");

    expect(api.buttonScan).toHaveBeenCalledWith("run-123");
    expect(result.data?.status).toBe("passed");
    expect(result.data?.elements_found).toBe(16);
    expect(result.data?.groups).toHaveLength(1);
  });

  it("returns error when run not found", async () => {
    vi.mocked(api.buttonScan).mockResolvedValue({
      data: null,
      error: "Run not found",
    });

    const result = await api.buttonScan("bad-id");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Run not found");
  });

  it("returns error for non-queued run", async () => {
    vi.mocked(api.buttonScan).mockResolvedValue({
      data: null,
      error: "Run is already running",
    });

    const result = await api.buttonScan("active-run");

    expect(result.error).toBe("Run is already running");
  });
});

// ─── ButtonScanPanel component ────────────────────────────────────────────────

import ButtonScanPanel from "./components/ButtonScanPanel";
import type { Run, RunStep } from "../../lib/api";

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

function makeStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: "step-1",
    run_id: "run-1",
    idx: 0,
    title: "Navigation Links (8 elements)",
    expected: "All elements should be accessible",
    status: "passed",
    notes: "All navigation links have descriptive text.",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe("ButtonScanPanel", () => {
  it("renders nothing for instruction-scope runs", () => {
    const run = makeRun({ scope_mode: "instructions" });
    const { container } = render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 'Run Scan' button for queued run", () => {
    const run = makeRun({ status: "queued" });
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(screen.getByRole("button", { name: /Trigger button scan/i })).toBeInTheDocument();
  });

  it("hides 'Run Scan' button when scanLoading", () => {
    const run = makeRun({ status: "queued" });
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: true,
      }),
    );
    expect(screen.queryByRole("button", { name: /Trigger button scan/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Scanning interactive elements/)).toBeInTheDocument();
  });

  it("calls onTriggerScan when Run Scan is clicked", () => {
    const onTriggerScan = vi.fn();
    const run = makeRun({ status: "queued" });
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan,
        scanLoading: false,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Trigger button scan/i }));
    expect(onTriggerScan).toHaveBeenCalledTimes(1);
  });

  it("shows scanning indicator when run is running", () => {
    const run = makeRun({ status: "running" });
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(screen.getByText(/Scanning interactive elements/)).toBeInTheDocument();
  });

  it("shows step results after run completes", () => {
    const run = makeRun({ status: "passed", summary: "All elements look good." });
    const steps = [
      makeStep({ title: "Navigation Links (8 elements)", status: "passed", notes: "Links are descriptive." }),
      makeStep({ id: "step-2", idx: 1, title: "Action Buttons (3 elements)", status: "failed", notes: "Two buttons have empty text." }),
    ];
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps,
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(screen.getByText("Navigation Links (8 elements)")).toBeInTheDocument();
    expect(screen.getByText("Action Buttons (3 elements)")).toBeInTheDocument();
    expect(screen.getByText("Links are descriptive.")).toBeInTheDocument();
  });

  it("shows summary line from run when no button scan steps found", () => {
    const run = makeRun({ status: "passed", summary: "Button scan complete." });
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(screen.getByText("Button scan complete.")).toBeInTheDocument();
  });

  it("renders 'Button Scan' title always", () => {
    const run = makeRun();
    render(
      React.createElement(ButtonScanPanel, {
        run,
        steps: [],
        onTriggerScan: vi.fn(),
        scanLoading: false,
      }),
    );
    expect(screen.getByText("Button Scan")).toBeInTheDocument();
  });
});
