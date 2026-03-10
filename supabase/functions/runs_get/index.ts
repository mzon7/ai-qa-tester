/**
 * runs_get — Edge Function
 *
 * Returns a single run with its steps and logs.
 * Verifies the run belongs to the authenticated user.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Missing Authorization header" }, 200);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Authentication required" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { run_id } = body as { run_id: string };

    if (!run_id?.trim()) {
      return json({ data: null, error: "run_id is required" }, 400);
    }

    const { data: run, error: runError } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, user_id, status, scope_mode, instructions, started_at, completed_at, summary, error, created_at")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) return json({ data: null, error: "Run not found" }, 404);

    // Fetch steps and logs in parallel
    const [stepsResult, logsResult] = await Promise.all([
      supabase
        .from("ai_qa_tester_qa_run_steps")
        .select("id, run_id, idx, title, expected, status, notes, started_at, completed_at")
        .eq("run_id", run_id)
        .order("idx", { ascending: true }),
      supabase
        .from("ai_qa_tester_qa_run_logs")
        .select("id, run_id, ts, level, message, step_id")
        .eq("run_id", run_id)
        .order("ts", { ascending: true })
        .limit(500),
    ]);

    return json({
      data: {
        run,
        steps: stepsResult.data ?? [],
        logs: logsResult.data ?? [],
      },
      error: null,
    });
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
