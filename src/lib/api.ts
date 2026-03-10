/**
 * Typed API wrappers for all Supabase Edge Function calls.
 * All functions return { data: T | null, error: string | null }.
 * External API calls MUST go through these wrappers — never call edge functions
 * directly from component code.
 */

import { callEdgeFunction } from "@mzon7/zon-incubator-sdk";
import { supabase, dbTable } from "./supabase";

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SettingsData {
  provider: string;
  key_hint: string | null;
  key_set: boolean;
  memory_retention_days: number;
  updated_at: string;
}

export interface SaveKeysResult {
  hint: string;
  provider: string;
}

export interface ValidateKeysResult {
  valid: boolean;
  message: string;
}

/** Save (encrypt + store) an API key for the given provider. */
export function settingsSaveKeys(provider: string, api_key: string) {
  return callEdgeFunction<SaveKeysResult>(supabase, "settings_save_keys", {
    provider,
    api_key,
  });
}

/** Load current settings (provider, key hint) — never returns the raw key. */
export function settingsGet() {
  return callEdgeFunction<SettingsData>(supabase, "settings_get", {});
}

/** Validate the stored API key by making a test call to the provider. */
export function settingsValidateKeys() {
  return callEdgeFunction<ValidateKeysResult>(supabase, "settings_validate_keys", {});
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export type RunStatus = "queued" | "running" | "passed" | "failed" | "canceled";
export type ScopeMode = "everything" | "instructions";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  url: string;
  status: "idle" | RunStatus;
  created_at: string;
  updated_at: string;
  // Enriched by projects_list join
  latest_run_id: string | null;
  latest_run_status: RunStatus | null;
  last_run_at: string | null;
}

export interface CreateProjectResult {
  project: Project;
  /** True if a project with this URL already existed for the user. */
  existed: boolean;
}

export interface ListProjectsResult {
  projects: Project[];
}

/** Create a new QA project. Validates and normalises the URL server-side. */
export function projectsCreate(targetUrl: string, name?: string) {
  return callEdgeFunction<CreateProjectResult>(supabase, "projects_create", {
    targetUrl,
    ...(name ? { name } : {}),
  });
}

/** List all projects for the current user, newest first (enriched with latest run). */
export function projectsList() {
  return callEdgeFunction<ListProjectsResult>(supabase, "projects_list", {});
}

// ─── Runs ──────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  project_id: string;
  user_id: string;
  status: RunStatus;
  scope_mode: ScopeMode;
  instructions: string | null;
  feature_description?: string | null | undefined;
  started_at: string | null;
  completed_at: string | null;
  summary: string | null;
  error: string | null;
  created_at: string;
}

export interface RunStep {
  id: string;
  run_id: string;
  idx: number;
  title: string;
  expected: string | null;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunLog {
  id: string;
  run_id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  step_id: string | null;
}

export interface CreateRunResult { run: Run }
export interface ListRunsResult { runs: Run[] }
export interface GetRunResult { run: Run; steps: RunStep[]; logs: RunLog[] }

/** Create a new test run for a project. */
export function runsCreate(
  project_id: string,
  scope_mode: ScopeMode,
  instructions?: string,
  feature_description?: string
) {
  return callEdgeFunction<CreateRunResult>(supabase, "runs_create", {
    project_id,
    scope_mode,
    ...(instructions ? { instructions } : {}),
    ...(feature_description?.trim() ? { feature_description: feature_description.trim() } : {}),
  });
}

/** List all runs for a project, newest first. Uses direct DB query to avoid
 *  edge-function auth issues that caused recurring Unauthorized errors. */
export async function runsListByProject(project_id: string): Promise<{ data: ListRunsResult | null; error: string | null }> {
  // Session guard — return empty rather than letting RLS produce an Unauthorized error.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: { runs: [] }, error: null };
  const { data, error } = await supabase
    .from(dbTable("qa_runs"))
    .select("id, project_id, user_id, status, scope_mode, instructions, feature_description, started_at, completed_at, summary, error, created_at")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { data: null, error: error.message };
  return { data: { runs: (data ?? []) as Run[] }, error: null };
}

/** Get a single run with its steps and logs. Uses direct DB query to avoid
 *  edge-function auth issues that caused recurring Unauthorized errors. */
export async function runsGet(run_id: string): Promise<{ data: GetRunResult | null; error: string | null }> {
  // Session guard — avoid letting RLS surface "Unauthorized" when no session.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: "No active session" };
  const [runResult, stepsResult, logsResult] = await Promise.all([
    supabase
      .from(dbTable("qa_runs"))
      .select("id, project_id, user_id, status, scope_mode, instructions, feature_description, started_at, completed_at, summary, error, created_at")
      .eq("id", run_id)
      .single(),
    supabase
      .from(dbTable("qa_run_steps"))
      .select("id, run_id, idx, title, expected, status, notes, started_at, completed_at")
      .eq("run_id", run_id)
      .order("idx", { ascending: true }),
    supabase
      .from(dbTable("qa_run_logs"))
      .select("id, run_id, ts, level, message, step_id")
      .eq("run_id", run_id)
      .order("ts", { ascending: true })
      .limit(500),
  ]);
  if (runResult.error || !runResult.data) return { data: null, error: runResult.error?.message ?? "Run not found" };
  return {
    data: {
      run: runResult.data as unknown as Run,
      steps: (stepsResult.data ?? []) as unknown as RunStep[],
      logs: (logsResult.data ?? []) as unknown as RunLog[],
    },
    error: null,
  };
}

// ─── Feature Plan ─────────────────────────────────────────────────────────────

export interface FeaturePlanStep {
  action: string;
  assertion: string;
  selector_hints: string[];
}

export interface FeaturePlanResult {
  run_id?: string;
  steps_created?: number;
  steps?: FeaturePlanStep[];
  /** Set when the feature description was too vague; the run stays queued. */
  needs_input?: boolean;
  message?: string;
}

/**
 * Uses Grok to convert the run's feature_description into a bounded, structured
 * test plan (≤ 10 steps) and stores each step as a "pending" qa_run_step row.
 */
export function runsFeaturePlan(run_id: string) {
  return callEdgeFunction<FeaturePlanResult>(supabase, "feature_plan", { run_id });
}


// ─── Feature Executor ─────────────────────────────────────────────────────────

export interface FeatureExecutorResult {
  accepted: boolean;
  run_id: string;
  message: string;
}

/**
 * Triggers the Playwright feature-step executor for a run that already has
 * planned qa_run_steps (populated by the feature_plan edge function).
 * Each step is executed headlessly; failures capture screenshots as artifacts.
 */
export function featureExecutor(run_id: string) {
  return callEdgeFunction<FeatureExecutorResult>(supabase, "feature_executor", { run_id });
}

// ─── Feature Report ───────────────────────────────────────────────────────────

export interface ReportStepResult {
  idx: number;
  title: string;
  expected: string | null;
  observed: string | null;
  status: string;
  artifacts: Array<{ type: string; url: string }>;
}

export interface FeatureReportTotals {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface FeatureReportResult {
  run_id: string;
  overall_status: string;
  summary: string;
  steps: ReportStepResult[];
  totals: FeatureReportTotals;
}

/**
 * Generates a structured test report for a completed feature run.
 * Compares expected vs observed per step, attaches signed artifact URLs for
 * failures, and uses Grok to produce a Markdown summary stored on qa_runs.summary.
 */
export function runsFeatureReport(run_id: string) {
  return callEdgeFunction<FeatureReportResult>(supabase, "feature_report", { run_id });
}

// ─── Button Scan ──────────────────────────────────────────────────────────────

export interface ButtonScanGroupResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  notes: string;
}

export interface ButtonScanResult {
  status: "passed" | "failed";
  summary: string;
  elements_found: number;
  groups: ButtonScanGroupResult[];
}

/**
 * Triggers a button smoke scan for a queued run.
 * Fetches the target page HTML, analyzes all interactive elements with AI,
 * creates run steps + logs, and marks the run as passed or failed.
 */
export function buttonScan(run_id: string) {
  return callEdgeFunction<ButtonScanResult>(supabase, "button_scan", { run_id });
}
