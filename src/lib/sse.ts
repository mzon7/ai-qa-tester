/**
 * useRunSSE — subscribes to the runs_stream edge function via EventSource.
 *
 * EventSource cannot set custom headers, so the JWT is passed as ?token=.
 * The hook handles deduplication, log capping, and auto-cleanup on unmount.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import type { RunStatus, RunLog, RunStep } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TERMINAL = new Set<string>(["passed", "failed", "canceled"]);

/** How many log lines to keep in state (oldest are discarded). */
const MAX_LOGS = 200;

export interface SSERunStatus {
  status: RunStatus;
  summary: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface UseRunSSEReturn {
  /** Latest run status from the stream (null before first event). */
  sseStatus: SSERunStatus | null;
  /** Accumulated log lines (capped at MAX_LOGS). */
  sseLogs: RunLog[];
  /** Latest steps snapshot from the stream. */
  sseSteps: RunStep[];
  /** True while the EventSource connection is open. */
  sseConnected: boolean;
}

export function useRunSSE(runId: string | null): UseRunSSEReturn {
  const [sseStatus, setSseStatus] = useState<SSERunStatus | null>(null);
  const [sseLogs, setSseLogs] = useState<RunLog[]>([]);
  const [sseSteps, setSseSteps] = useState<RunStep[]>([]);
  const [sseConnected, setSseConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const seenLogIds = useRef<Set<string>>(new Set());
  const isTerminal = useRef(false);

  const closeES = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setSseConnected(false);
  }, []);

  useEffect(() => {
    if (!runId) {
      setSseStatus(null);
      setSseLogs([]);
      setSseSteps([]);
      seenLogIds.current.clear();
      isTerminal.current = false;
      closeES();
      return;
    }

    let cancelled = false;
    seenLogIds.current.clear();
    isTerminal.current = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.access_token) return;

      const url =
        `${SUPABASE_URL}/functions/v1/runs_stream` +
        `?runId=${encodeURIComponent(runId)}` +
        `&token=${encodeURIComponent(session.access_token)}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (!cancelled) setSseConnected(true);
      };

      // Connection errors — EventSource auto-reconnects; we just mark disconnected.
      es.onerror = (e) => {
        if (e instanceof MessageEvent) return; // server-sent "error" event, handled below
        setSseConnected(false);
      };

      es.addEventListener("status", (e: Event) => {
        if (cancelled) return;
        const data = JSON.parse((e as MessageEvent).data) as SSERunStatus;
        setSseStatus(data);
        if (TERMINAL.has(data.status)) {
          isTerminal.current = true;
          closeES();
        }
      });

      es.addEventListener("log", (e: Event) => {
        if (cancelled) return;
        const { log } = JSON.parse((e as MessageEvent).data) as { log: RunLog };
        if (!log?.id || seenLogIds.current.has(log.id)) return;
        seenLogIds.current.add(log.id);
        setSseLogs((prev) => {
          const next = [...prev, log];
          return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        });
      });

      es.addEventListener("steps", (e: Event) => {
        if (cancelled) return;
        const { steps } = JSON.parse((e as MessageEvent).data) as { steps: RunStep[] };
        setSseSteps(steps ?? []);
      });

      es.addEventListener("done", () => {
        isTerminal.current = true;
        closeES();
      });

      // Server-sent error event (name "error" from the edge fn)
      es.addEventListener("error", (e: Event) => {
        if (e instanceof MessageEvent) {
          console.warn("[SSE] stream error:", (e as MessageEvent).data);
          closeES();
        }
        // plain ErrorEvent (connection error) is already handled by onerror
      });
    });

    return () => {
      cancelled = true;
      closeES();
    };
  }, [runId, closeES]);

  return { sseStatus, sseLogs, sseSteps, sseConnected };
}
