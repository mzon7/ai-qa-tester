/**
 * buttonScanUtils — shared utilities for the button scan feature.
 *
 * These run entirely in the browser (no API calls) and are used by
 * ButtonScanPanel for display logic and by tests for unit coverage.
 */

// ─── Safety blacklist ─────────────────────────────────────────────────────────

export const DESTRUCTIVE_KEYWORDS = [
  "delete",
  "remove account",
  "cancel subscription",
  "unsubscribe",
  "clear all",
  "destroy",
  "terminate",
  "wipe",
  "purge",
  "deactivate account",
];

/** Returns true if the button text indicates a potentially destructive action. */
export function isDestructiveButton(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Element classification ───────────────────────────────────────────────────

export type ButtonType = "navigation" | "form-submit" | "action";

/**
 * Classifies an interactive element by tag name and optional input type.
 * Matches the three groups used by the button_scan edge function.
 */
export function classifyButtonType(tagName: string, inputType?: string): ButtonType {
  const tag = tagName.toLowerCase();
  if (tag === "a") return "navigation";
  if (tag === "input" && (inputType === "submit" || inputType === "button")) return "form-submit";
  return "action";
}

// ─── Step stats ───────────────────────────────────────────────────────────────

export interface StepCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
}

/** Counts run step statuses from a list of step objects. */
export function countStepsByStatus(
  steps: Array<{ status: string }>,
): StepCounts {
  return {
    total: steps.length,
    passed: steps.filter((s) => s.status === "passed").length,
    failed: steps.filter((s) => s.status === "failed").length,
    skipped: steps.filter((s) => s.status === "skipped").length,
    pending: steps.filter((s) => s.status === "pending" || s.status === "running").length,
  };
}

// ─── Summary formatting ───────────────────────────────────────────────────────

/** Formats a human-readable summary line for button scan results. */
export function formatScanSummary(counts: StepCounts): string {
  if (counts.total === 0) return "No element groups scanned";
  const parts: string[] = [`${counts.total} group${counts.total !== 1 ? "s" : ""} scanned`];
  if (counts.passed > 0) parts.push(`${counts.passed} passed`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  return parts.join(" · ");
}

// ─── Button scan step detection ───────────────────────────────────────────────

const BUTTON_SCAN_STEP_NAMES = ["navigation", "action", "form"];

/**
 * Returns true if the step title matches a button_scan-generated step
 * (Navigation Links, Action Buttons, or Form Submissions).
 */
export function isButtonScanStep(title: string): boolean {
  const lower = title.toLowerCase();
  return BUTTON_SCAN_STEP_NAMES.some((name) => lower.includes(name));
}
