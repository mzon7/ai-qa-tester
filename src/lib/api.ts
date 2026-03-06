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

export interface Project {
  id: string;
  user_id: string;
  name: string;
  url: string;
  status: "idle" | "queued" | "running" | "passed" | "failed" | "canceled";
  created_at: string;
  updated_at: string;
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

/** List all projects for the current user, newest first. */
export function projectsList() {
  return callEdgeFunction<ListProjectsResult>(supabase, "projects_list", {});
}
