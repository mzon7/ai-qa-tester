/**
 * useRunStream — subscribes to live run updates via SSE (EventSource).
 *
 * Connects to the `runs_stream` edge function which polls the DB and emits:
 *   status  — run status/summary changed
 *   steps   — full snapshot of run steps (sent on any change)
 *   log     — a single new log entry
 *   done    — run reached a terminal state
 *   error   — stream-level error
 *
 * The hook automatically:
 *   - Opens the EventSource when runId is provided and enabled=true
 *   - Closes and cleans up on unmount, runId change, or terminal state
 *   - Reconnects once if the connection drops while the run is still active
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Run, RunStep, RunLog } from "../../../lib/api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TERMINAL = new Set(["passed", "failed", "canceled"]);

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error";

export interface RunStreamState {
  /** Current run status fields from the stream (partial — only what's been pushed) */
  runPatch: Partial<Pick<Run, "status" | "summary" | "error" | "started_at" | "completed_at">> | null;
  steps: RunStep[];
  logs: RunLog[];
  streamStatus: StreamStatus;
  streamError: string | null;
  /** Call to manually close the stream (e.g. user navigates away) */
  close: () => void;
}

export function useRunStream(
  runId: string | null,
  enabled = true,
): RunStreamState {
  const [runPatch, setRunPatch] = useState<RunStreamState["runPatch"]>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);

  const close = useCallback(() => {
    closedRef.current = true;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStreamStatus("done");
  }, []);

  useEffect(() => {
    if (!runId || !enabled) return;

    closedRef.current = false;
    setStreamStatus("connecting");
    setRunPatch(null);
    setSteps([]);
    setLogs([]);
    setStreamError(null);

    let es: EventSource;

    const connect = async () => {
      // Grab the current access token — passed as query param because
      // EventSource does not support custom request headers.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setStreamStatus("error");
        setStreamError("Not authenticated");
        return;
      }
      if (closedRef.current) return;

      const url = `${SUPABASE_URL}/functions/v1/runs_stream?runId=${encodeURIComponent(runId)}&token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("open", () => {
        if (!closedRef.current) setStreamStatus("streaming");
      });

      es.addEventListener("status", (e: MessageEvent) => {
        if (closedRef.current) return;
        try {
          const data = JSON.parse(e.data) as {
            runId: string;
            status: Run["status"];
            summary: string | null;
            error: string | null;
            started_at: string | null;
            completed_at: string | null;
          };
          setRunPatch({
            status: data.status,
            summary: data.summary,
            error: data.error,
            started_at: data.started_at,
            completed_at: data.completed_at,
          });
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener("steps", (e: MessageEvent) => {
        if (closedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { steps: RunStep[] };
          setSteps(data.steps ?? []);
        } catch { /* ignore */ }
      });

      es.addEventListener("log", (e: MessageEvent) => {
        if (closedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { log: RunLog };
          setLogs((prev) => [...prev, data.log]);
        } catch { /* ignore */ }
      });

      es.addEventListener("done", (e: MessageEvent) => {
        if (closedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { status: string };
          setRunPatch((prev) => ({ ...prev, status: data.status as Run["status"] }));
        } catch { /* ignore */ }
        setStreamStatus("done");
        es.close();
        esRef.current = null;
      });

      es.addEventListener("error", (e: MessageEvent) => {
        if (closedRef.current) return;
        try {
          const data = JSON.parse(e.data) as { message: string };
          setStreamError(data.message);
        } catch { /* ignore */ }
        setStreamStatus("error");
        es.close();
        esRef.current = null;
      });

      // Native EventSource error (network drop, 4xx from server)
      es.onerror = () => {
        if (closedRef.current) return;
        // If we're still in a non-terminal run state, the EventSource will
        // auto-reconnect (browser behaviour). Just update UI status.
        setStreamStatus((prev) => {
          // If already done/error don't flip back
          if (prev === "done" || prev === "error") return prev;
          return "connecting";
        });
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      esRef.current?.close();
      esRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, enabled]);

  // Auto-close when the run patch indicates a terminal status
  useEffect(() => {
    if (runPatch?.status && TERMINAL.has(runPatch.status)) {
      if (streamStatus !== "done") {
        esRef.current?.close();
        esRef.current = null;
        setStreamStatus("done");
      }
    }
  }, [runPatch?.status, streamStatus]);

  return { runPatch, steps, logs, streamStatus, streamError, close };
}
