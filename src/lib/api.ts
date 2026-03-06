/**
 * Typed API wrappers for all Supabase Edge Function calls.
 * All functions return { data: T | null, error: string | null }.
 * External API calls MUST go through these wrappers — never call edge functions
 * directly from component code.
 */

import { callEdgeFunction } from "@mzon7/zon-incubator-sdk";
import { supabase } from "./supabase";

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
export function runsCreate(project_id: string, scope_mode: ScopeMode, instructions?: string) {
  return callEdgeFunction<CreateRunResult>(supabase, "runs_create", {
    project_id,
    scope_mode,
    ...(instructions ? { instructions } : {}),
  });
}

/** List all runs for a project, newest first. */
export function runsListByProject(project_id: string) {
  return callEdgeFunction<ListRunsResult>(supabase, "runs_list_by_project", { project_id });
}

/** Get a single run with its steps and logs. */
export function runsGet(run_id: string) {
  return callEdgeFunction<GetRunResult>(supabase, "runs_get", { run_id });
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
