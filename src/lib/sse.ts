/**
 * useRunSSE — subscribes to the runs_stream edge function for live run updates.
 *
 * Uses fetch() with a streaming body instead of EventSource so we can send
 * the Authorization header (EventSource cannot set custom headers).
 * The response is a text/event-stream; we parse SSE events manually.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { runsGet } from "./api";
import type { RunStatus, RunLog, RunStep } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TERMINAL = new Set<string>(["passed", "failed", "canceled"]);

/** Maximum log lines kept in state (oldest discarded when exceeded). */
const MAX_LOGS = 200;

export interface SSERunStatus {
  status: RunStatus;
  summary: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface UseRunSSEReturn {
  /** Latest run status received via SSE. */
  sseStatus: SSERunStatus | null;
  /** Accumulated log lines, capped at MAX_LOGS. */
  sseLogs: RunLog[];
  /** Latest steps snapshot from the stream. */
  sseSteps: RunStep[];
  /** True while the stream connection is active. */
  sseConnected: boolean;
}

/** Parse raw SSE text into { event, data } pairs. */
function parseSSEChunk(text: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  // SSE events are separated by double newlines
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      }
    }
    if (data) events.push({ event, data });
  }
  return events;
}

export function useRunSSE(runId: string | null): UseRunSSEReturn {
  const [sseStatus, setSseStatus] = useState<SSERunStatus | null>(null);
  const [sseLogs, setSseLogs] = useState<RunLog[]>([]);
  const [sseSteps, setSseSteps] = useState<RunStep[]>([]);
  const [sseConnected, setSseConnected] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const seenLogIds = useRef<Set<string>>(new Set());

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSseConnected(false);
  }, []);

  useEffect(() => {
    if (!runId) {
      setSseStatus(null);
      setSseLogs([]);
      setSseSteps([]);
      seenLogIds.current.clear();
      stop();
      return;
    }

    let cancelled = false;
    seenLogIds.current.clear();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session?.access_token) return;

      const url = `${SUPABASE_URL}/functions/v1/runs_stream?runId=${encodeURIComponent(runId)}`;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Accept: "text/event-stream",
          },
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          stop();
          return;
        }

        if (!cancelled) setSseConnected(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let partial = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done || cancelled) break;

          partial += decoder.decode(value, { stream: true });

          // Extract complete SSE blocks (terminated by \n\n)
          const lastDoubleNewline = partial.lastIndexOf("\n\n");
          if (lastDoubleNewline === -1) continue;

          const complete = partial.slice(0, lastDoubleNewline + 2);
          partial = partial.slice(lastDoubleNewline + 2);

          for (const { event, data } of parseSSEChunk(complete)) {
            if (cancelled) break;
            try {
              if (event === "status") {
                const d = JSON.parse(data) as SSERunStatus;
                setSseStatus(d);
                if (TERMINAL.has(d.status)) {
                  stop();
                  return;
                }
              } else if (event === "log") {
                const { log } = JSON.parse(data) as { log: RunLog };
                if (!log?.id || seenLogIds.current.has(log.id)) continue;
                seenLogIds.current.add(log.id);
                setSseLogs((prev) => {
                  const next = [...prev, log];
                  return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
                });
              } else if (event === "steps") {
                const { steps } = JSON.parse(data) as { steps: RunStep[] };
                setSseSteps(steps ?? []);
              } else if (event === "done") {
                stop();
                return;
              }
            } catch {
              // Malformed event — skip
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setSseConnected(false);
        }
      }

      if (!cancelled) setSseConnected(false);
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [runId, stop]);

  // ── Polling fallback ──────────────────────────────────────────────────────
  // When SSE is unavailable, poll runsGet every 2s so live updates still work.
  // Stops automatically when SSE connects (sseConnected becomes true).
  useEffect(() => {
    if (!runId || sseConnected) return;

    let cancelled = false;

    const appendNewLogs = (logs: RunLog[]) => {
      for (const log of logs) {
        if (!log?.id || seenLogIds.current.has(log.id)) continue;
        seenLogIds.current.add(log.id);
        setSseLogs((prev) => {
          const next = [...prev, log];
          return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        });
      }
    };

    const poll = async () => {
      if (cancelled) return;
      const { data } = await runsGet(runId);
      if (cancelled || !data) return;

      setSseStatus({
        status: data.run.status,
        summary: data.run.summary,
        error: data.run.error,
        started_at: data.run.started_at,
        completed_at: data.run.completed_at,
      });

      appendNewLogs(data.logs ?? []);

      if (data.steps?.length) {
        setSseSteps(data.steps);
      }
    };

    // Immediate first poll, then every 2s
    poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId, sseConnected]);

  return { sseStatus, sseLogs, sseSteps, sseConnected };
}
