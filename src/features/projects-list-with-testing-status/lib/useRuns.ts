import { useState, useEffect, useCallback } from "react";
import { runsCreate } from "../../../lib/api";
import type { Run, RunStep, RunLog, ScopeMode } from "../../../lib/api";
import { supabase, dbTable } from "../../../lib/supabase";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

interface UseRunsReturn {
  runs: Run[];
  latestRun: Run | null;
  loading: boolean;
  error: string | null;
  createRun: (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => Promise<{ run: Run | null; error: string | null }>;
  refresh: () => void;
}

/** Manages the runs list for a project, with 30s polling and fast-poll when active. */
export function useRuns(projectId: string | null): UseRunsReturn {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  // Subscribe to auth state changes so we can react immediately rather than
  // waiting for the next poll cycle to discover a session change.
  // SIGNED_OUT → clear stale run data.
  // TOKEN_REFRESHED / SIGNED_IN → trigger a fresh fetch.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRuns([]);
        setError(null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    if (!projectId) { setRuns([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchRuns = async () => {
      // Guard: ensure an active session before querying.
      // getSession() returns a cached token; if null, try refreshing once — the
      // refresh token may still be valid even if the access token has expired.
      // This prevents "Unauthorized" errors from being logged for users who are
      // still actively using the app but whose access token quietly expired.
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      if (cancelled || !session) { setLoading(false); return; }

      // Query the DB directly instead of via edge function — avoids the
      // auth-token-over-HTTP problem that caused recurring Unauthorized errors.
      const { data, error: err } = await supabase
        .from(dbTable("qa_runs"))
        .select("id, project_id, user_id, status, scope_mode, instructions, feature_description, started_at, completed_at, summary, error, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setLoading(false);
      if (err || !data) {
        if (err) setError(err.message);
        return;
      }
      setError(null);
      setRuns(data as Run[]);
    };
    fetchRuns();

    return () => { cancelled = true; };
  }, [projectId, rev]);

  // Poll: 5s if a run is active, 30s otherwise
  const latestRun = runs[0] ?? null;
  const isActive = latestRun ? ACTIVE_STATUSES.has(latestRun.status) : false;

  useEffect(() => {
    if (!projectId) return;
    const delay = isActive ? 5_000 : 30_000;
    const id = setInterval(refresh, delay);
    return () => clearInterval(id);
  }, [projectId, isActive, refresh]);

  const createRun = useCallback(async (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => {
    if (!projectId) return { run: null, error: "No project selected" };
    // Guard: verify session before calling edge function — an expired session
    // causes a 401 from the edge function. Try refreshSession() first so a
    // user who's still active but has an expired access token can still create runs.
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session) return { run: null, error: "Session expired — please sign in again" };
    const { data, error: err } = await runsCreate(projectId, scopeMode, instructions, featureDescription);
    if (err || !data) {
      // callEdgeFunction already auto-reports infrastructure errors to incubator_self_heal_errors.
      // Do not duplicate-report here — it causes false positives for transient auth issues.
      return { run: null, error: err ?? "Failed to create run" };
    }
    setRuns((prev) => [data.run, ...prev]);
    return { run: data.run, error: null };
  }, [projectId]);

  return { runs, latestRun, loading, error, createRun, refresh };
}

interface UseRunDetailReturn {
  run: Run | null;
  steps: RunStep[];
  logs: RunLog[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Fetches details (steps + logs) for a specific run, polls when active. */
export function useRunDetail(runId: string | null): UseRunDetailReturn {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  // Mirror the auth state subscription from useRuns:
  // clear stale detail data on sign-out so polling stops cleanly.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRun(null);
        setSteps([]);
        setLogs([]);
        setError(null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    if (!runId) { setRun(null); setSteps([]); setLogs([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchDetail = async () => {
      // Guard: skip if no active session. Try a token refresh first in case the
      // access token expired — the refresh token may still be valid.
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      if (cancelled || !session) { setLoading(false); return; }

      // Query DB directly — avoids edge function auth issues during polling.
      const [runResult, stepsResult, logsResult] = await Promise.all([
        supabase
          .from(dbTable("qa_runs"))
          .select("id, project_id, user_id, status, scope_mode, instructions, feature_description, started_at, completed_at, summary, error, created_at")
          .eq("id", runId)
          .single(),
        supabase
          .from(dbTable("qa_run_steps"))
          .select("id, run_id, idx, title, expected, status, notes, started_at, completed_at")
          .eq("run_id", runId)
          .order("idx", { ascending: true }),
        supabase
          .from(dbTable("qa_run_logs"))
          .select("id, run_id, ts, level, message, step_id")
          .eq("run_id", runId)
          .order("ts", { ascending: true })
          .limit(500),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (runResult.error || !runResult.data) {
        if (runResult.error) setError(runResult.error.message);
        return;
      }
      setError(null);
      setRun(runResult.data as unknown as Run);
      setSteps((stepsResult.data ?? []) as unknown as RunStep[]);
      setLogs((logsResult.data ?? []) as unknown as RunLog[]);
    };
    fetchDetail();

    return () => { cancelled = true; };
  }, [runId, rev]);

  // Fast-poll while active
  const isActive = run ? ACTIVE_STATUSES.has(run.status) : false;
  useEffect(() => {
    if (!runId || !isActive) return;
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [runId, isActive, refresh]);

  return { run, steps, logs, loading, error, refresh };
}
