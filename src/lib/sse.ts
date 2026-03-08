/**
 * useRunSSE — subscribes to the runs_stream edge function for live run updates.
 *
 * Uses fetch() with a streaming body instead of EventSource so we can send
 * the Authorization header (EventSource cannot set custom headers).
 * The response is a text/event-stream; we parse SSE events manually.
 *
 * Robustness features (Step 5):
 *   - Auto-reconnect with exponential backoff (1s → 2s → 4s … 30s cap)
 *   - Dedup log events by id across reconnects via seenLogIds ref
 *   - No reconnect on: user abort, terminal run status, component unmount
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { runsGet } from "./api";
import type { RunStatus, RunLog, RunStep } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TERMINAL = new Set<string>(["passed", "failed", "canceled"]);

/** Maximum log lines kept in state (oldest discarded when exceeded). */
const MAX_LOGS = 200;

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

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
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (data) events.push({ event, data });
  }
  return events;
}

export function useRunSSE(
  runId: string | null,
  /** Called once when the run first reaches a terminal state (passed/failed/canceled). */
  onTerminal?: () => void,
): UseRunSSEReturn {
  const [sseStatus, setSseStatus] = useState<SSERunStatus | null>(null);
  const [sseLogs, setSseLogs] = useState<RunLog[]>([]);
  const [sseSteps, setSseSteps] = useState<RunStep[]>([]);
  const [sseConnected, setSseConnected] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // seenLogIds persists across reconnects — cleared only when runId changes
  const seenLogIds = useRef<Set<string>>(new Set());
  // Hold latest onTerminal in a ref so the effect doesn't need it as a dep
  const onTerminalRef = useRef(onTerminal);
  useEffect(() => { onTerminalRef.current = onTerminal; }, [onTerminal]);
  // Ensure onTerminal fires at most once per runId
  const terminalFiredRef = useRef(false);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSseConnected(false);
  }, []);

  /** Append only log rows we haven't seen before (dedup by id). */
  const appendLog = useCallback((log: RunLog) => {
    if (!log?.id || seenLogIds.current.has(log.id)) return;
    seenLogIds.current.add(log.id);
    setSseLogs((prev) => {
      const next = [...prev, log];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
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
    // Reset dedup + terminal-fired flag when switching to a new run
    seenLogIds.current.clear();
    terminalFiredRef.current = false;
    // Backoff state — local to this effect invocation, persists across reconnects
    let backoffMs = BACKOFF_INITIAL_MS;

    /** Fire onTerminal exactly once per run, then stop the stream. */
    const fireTerminal = () => {
      stop();
      if (!terminalFiredRef.current) {
        terminalFiredRef.current = true;
        onTerminalRef.current?.();
      }
    };

    const url = `${SUPABASE_URL}/functions/v1/runs_stream?runId=${encodeURIComponent(runId)}`;

    /** Schedule a reconnect after the current backoff delay, then double it. */
    const scheduleReconnect = () => {
      if (cancelled) return;
      setSseConnected(false);
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      setTimeout(() => { if (!cancelled) connect(); }, delay);
    };

    const connect = async () => {
      if (cancelled) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Whether the stream ended due to a terminal run state (no reconnect needed)
      let terminal = false;

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Accept: "text/event-stream",
          },
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          // Non-2xx or no body — back off and retry
          scheduleReconnect();
          return;
        }

        // Successful connection — reset backoff
        if (!cancelled) {
          setSseConnected(true);
          backoffMs = BACKOFF_INITIAL_MS;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let partial = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done || cancelled) break;

          partial += decoder.decode(value, { stream: true });

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
                  terminal = true;
                  fireTerminal();
                  return;
                }
              } else if (event === "log") {
                const { log } = JSON.parse(data) as { log: RunLog };
                appendLog(log);
              } else if (event === "steps") {
                const { steps } = JSON.parse(data) as { steps: RunStep[] };
                setSseSteps(steps ?? []);
              } else if (event === "done") {
                terminal = true;
                fireTerminal();
                return;
              }
            } catch {
              // Malformed event — skip
            }
          }
        }
      } catch (err) {
        // AbortError means we intentionally stopped — don't reconnect
        if ((err as Error)?.name === "AbortError") return;
        setSseConnected(false);
      }

      // Stream ended unexpectedly (edge fn timeout, network drop, etc.)
      // Reconnect unless we hit a terminal state or were cancelled.
      if (!cancelled && !terminal) {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      cancelled = true;
      stop();
    };
  }, [runId, stop, appendLog]);

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

      const status: SSERunStatus = {
        status: data.run.status,
        summary: data.run.summary,
        error: data.run.error,
        started_at: data.run.started_at,
        completed_at: data.run.completed_at,
      };
      setSseStatus(status);
      appendNewLogs(data.logs ?? []);
      if (data.steps?.length) setSseSteps(data.steps);

      // On terminal: fire callback once then stop polling
      if (TERMINAL.has(data.run.status) && !terminalFiredRef.current) {
        terminalFiredRef.current = true;
        cancelled = true;
        clearInterval(id);
        onTerminalRef.current?.();
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
