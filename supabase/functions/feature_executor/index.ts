/**
 * feature_executor — Edge Function
 *
 * Delegates feature-step execution to the Playwright server.
 * The Playwright server reads the pre-planned qa_run_steps for the run,
 * executes each step with headless Chrome, captures artifacts on failure,
 * and writes results back to qa_run_steps + qa_run_logs + qa_artifacts.
 *
 * This edge function validates auth + run ownership, then fires the
 * /execute-steps request to the Playwright server (async, 202).
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
    if (!authHeader) return json({ data: null, error: "Missing Authorization header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 401);

    const body = await req.json();
    const { run_id } = body as { run_id: string };
    if (!run_id?.trim()) return json({ data: null, error: "run_id is required" }, 400);

    // Verify the run exists, belongs to this user, and has a feature_description
    const { data: run, error: runErr } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, status, feature_description")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runErr || !run) return json({ data: null, error: "Run not found" }, 404);
    if (!run.feature_description) {
      return json({ data: null, error: "This run has no feature description — feature executor requires a feature_description" }, 400);
    }
    if (!["queued", "running"].includes(run.status)) {
      return json({ data: null, error: `Run is already ${run.status}` }, 409);
    }

    // ── Check Playwright server is configured ──────────────────────────────
    const playwrightUrl = Deno.env.get("PLAYWRIGHT_SERVER_URL");
    const playwrightSecret = Deno.env.get("PLAYWRIGHT_SCAN_SECRET");

    if (!playwrightUrl || !playwrightSecret) {
      return json({
        data: null,
        error: "Playwright server not configured. Set PLAYWRIGHT_SERVER_URL and PLAYWRIGHT_SCAN_SECRET.",
      }, 503);
    }

    // ── Dispatch to Playwright server ───────────────────────────────────────
    const execRes = await fetch(`${playwrightUrl}/execute-steps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Scan-Secret": playwrightSecret,
      },
      body: JSON.stringify({ run_id }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!execRes.ok) {
      const errText = await execRes.text().catch(() => execRes.statusText);
      return json({ data: null, error: `Playwright server error (${execRes.status}): ${errText}` }, 502);
    }

    return json({
      data: { accepted: true, run_id, message: "Feature step execution started — poll run status for updates" },
      error: null,
    }, 202);
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
