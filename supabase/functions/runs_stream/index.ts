/**
 * runs_stream — SSE Edge Function
 *
 * Streams live run updates (status, steps, logs) via Server-Sent Events.
 * Client connects via EventSource since browsers cannot set custom headers
 * on EventSource; the auth token is passed as a query param instead.
 *
 * Events emitted:
 *   status  — { runId, status, summary, error, started_at, completed_at }
 *   steps   — { steps: RunStep[] }  (full snapshot, sent on any change)
 *   log     — { log: RunLog }       (one per new log entry, cursor-based)
 *   done    — { status }            (terminal state reached)
 *   error   — { message }           (stream-level error)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TERMINAL = new Set(["passed", "failed", "canceled"]);
const POLL_MS = 2_000;
// Stay within Supabase free-tier function wall-clock limit (150 s).
// Clients must reconnect for longer runs.
const MAX_MS = 120_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  // Token passed as query param because EventSource cannot set headers.
  const token =
    url.searchParams.get("token") ??
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!runId?.trim()) {
    return new Response(JSON.stringify({ error: "runId is required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  // Validate JWT using user-scoped client (service-role key cannot validate user JWTs)
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify the run belongs to this user
  const { data: runCheck } = await supabase
    .from("ai_qa_tester_qa_runs")
    .select("id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .single();

  if (!runCheck) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Build the SSE stream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const send = (event: string, data: unknown): boolean => {
    try {
      writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      return true;
    } catch {
      return false;
    }
  };

  // Poll in background; do NOT await so we return the streaming Response first.
  (async () => {
    const deadline = Date.now() + MAX_MS;
    let lastStatus: string | null = null;
    // Track steps by a simple serialised snapshot for change detection
    let lastStepsJson = "";
    // Cursor: only fetch logs newer than this timestamp
    let lastLogTs: string | null = null;

    try {
      while (Date.now() < deadline) {
        const [runRes, stepsRes] = await Promise.all([
          supabase
            .from("ai_qa_tester_qa_runs")
            .select("id, status, summary, error, started_at, completed_at")
            .eq("id", runId)
            .single(),
          supabase
            .from("ai_qa_tester_qa_run_steps")
            .select("id, run_id, idx, title, expected, status, notes, started_at, completed_at")
            .eq("run_id", runId)
            .order("idx", { ascending: true }),
        ]);

        const run = runRes.data;
        if (!run) break; // run deleted or auth revoked

        // ── Status event ──────────────────────────────────────────────────────
        if (run.status !== lastStatus) {
          lastStatus = run.status;
          const ok = send("status", {
            runId,
            status: run.status,
            summary: run.summary,
            error: run.error,
            started_at: run.started_at,
            completed_at: run.completed_at,
          });
          if (!ok) break;
        }

        // ── Steps event (full snapshot on change) ─────────────────────────────
        const steps = stepsRes.data ?? [];
        const stepsJson = JSON.stringify(steps);
        if (stepsJson !== lastStepsJson) {
          lastStepsJson = stepsJson;
          const ok = send("steps", { steps });
          if (!ok) break;
        }

        // ── Log events (cursor-based, one event per new entry) ────────────────
        const logsQuery = supabase
          .from("ai_qa_tester_qa_run_logs")
          .select("id, run_id, ts, level, message, step_id")
          .eq("run_id", runId)
          .order("ts", { ascending: true })
          .limit(100);

        if (lastLogTs) logsQuery.gt("ts", lastLogTs);

        const { data: newLogs } = await logsQuery;
        if (newLogs?.length) {
          for (const log of newLogs) {
            const ok = send("log", { log });
            if (!ok) break;
          }
          lastLogTs = newLogs[newLogs.length - 1].ts;
        }

        // ── Terminal state ────────────────────────────────────────────────────
        if (TERMINAL.has(run.status)) {
          send("done", { status: run.status });
          break;
        }

        // Wait before next poll
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (err) {
      send("error", { message: (err as Error)?.message ?? "Stream error" });
    } finally {
      try { writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
