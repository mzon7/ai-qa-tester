import { useState, useEffect, useCallback, useRef } from "react";
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { runsCreate, runsListByProject, runsGet } from "../../../lib/api";
import type { Run, RunStep, RunLog, ScopeMode } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

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

  useEffect(() => {
    if (!projectId) { setRuns([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchRuns = async () => {
      // Validate the session with the auth server before fetching.
      // getUser() (not getSession()) triggers a token refresh if expired,
      // preventing stale/expired JWTs from reaching the edge function.
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      return runsListByProject(projectId)
        .then(({ data, error: err }) => {
          if (cancelled) return;
          if (err || !data) {
            setLoading(false);
            const msg = err ?? "Failed to load runs";
            // Silently swallow transient errors during polling
            const isTransient =
              msg.includes("Failed to send a request") ||
              msg.includes("fetch") ||
              msg.includes("network") ||
              msg === "Unauthorized";
            if (isTransient) return;
            setError(msg);
            reportSelfHealError(supabase, {
              category: "frontend",
              source: "useRuns",
              errorMessage: msg,
              projectPrefix: "ai_qa_tester_",
              metadata: { action: "runsListByProject", projectId },
            });
            return;
          }
          setLoading(false);
          setRuns(data.runs ?? []);
        })
        .catch((_thrown: unknown) => {
          if (cancelled) return;
          setLoading(false);
          // Swallow transient fetch failures during background polling
        });
    };
    fetchRuns();

    return () => { cancelled = true; };
  }, [projectId, rev]);

  // Poll: 5s if a run is active, 30s otherwise
  const latestRun = runs[0] ?? null;
  const isActive = latestRun ? ACTIVE_STATUSES.has(latestRun.status) : false;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const delay = isActive ? 5_000 : 30_000;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refresh, delay);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [projectId, isActive, refresh]);

  const createRun = useCallback(async (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => {
    if (!projectId) return { run: null, error: "No project selected" };
    const { data, error: err } = await runsCreate(projectId, scopeMode, instructions, featureDescription);
    if (err || !data) {
      const msg = err ?? "Failed to create run";
      reportSelfHealError(supabase, {
        category: "frontend",
        source: "useRuns",
        errorMessage: msg,
        projectPrefix: "ai_qa_tester_",
        metadata: { action: "runsCreate", projectId, scopeMode },
      });
      return { run: null, error: msg };
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

  useEffect(() => {
    if (!runId) { setRun(null); setSteps([]); setLogs([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    runsGet(runId).then(({ data, error: err }) => {
      if (cancelled) return;
      setLoading(false);
      if (err || !data) {
        const msg = err ?? "Failed to load run";
        setError(msg);
        reportSelfHealError(supabase, {
          category: "frontend",
          source: "useRunDetail",
          errorMessage: msg,
          projectPrefix: "ai_qa_tester_",
          metadata: { action: "runsGet", runId },
        });
        return;
      }
      setRun(data.run);
      setSteps(data.steps);
      setLogs(data.logs);
    });

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
