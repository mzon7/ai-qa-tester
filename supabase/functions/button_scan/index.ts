/**
 * button_scan — Edge Function
 *
 * Delegates real browser-based QA scanning to the Playwright server running
 * on the dedicated droplet. The Playwright server:
 *   1. Loads target_url in a real headless Chrome
 *   2. Finds all visible interactive elements (handles SPAs/React apps)
 *   3. Clicks each element safely in an isolated context
 *   4. Detects navigation, JS errors, network failures
 *   5. Captures screenshots on failure → uploads to Supabase Storage
 *   6. Writes qa_run_steps, qa_run_logs, qa_artifacts directly to Supabase
 *   7. Marks the run passed or failed with a summary
 *
 * This edge function just validates auth, verifies the run exists,
 * then fires the scan request to the Playwright server (async, 202).
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
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { run_id } = body as { run_id: string };
    if (!run_id?.trim()) return json({ data: null, error: "run_id is required" }, 400);

    // Verify the run exists and belongs to this user
    const { data: run, error: runErr } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, status")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runErr || !run) return json({ data: null, error: "Run not found" }, 404);
    if (!["queued", "running"].includes(run.status)) {
      return json({ data: null, error: `Run is already ${run.status}` }, 409);
    }

    // ── Check Playwright server is configured ────────────────────────────────
    const playwrightUrl = Deno.env.get("PLAYWRIGHT_SERVER_URL");
    const playwrightSecret = Deno.env.get("PLAYWRIGHT_SCAN_SECRET");

    if (!playwrightUrl || !playwrightSecret) {
      return json({
        data: null,
        error: "Playwright server not configured. Set PLAYWRIGHT_SERVER_URL and PLAYWRIGHT_SCAN_SECRET in Supabase edge function secrets.",
      }, 503);
    }

    // ── Dispatch to Playwright server (fire and forget — it writes to DB) ────
    const scanRes = await fetch(`${playwrightUrl}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Scan-Secret": playwrightSecret,
      },
      body: JSON.stringify({ run_id }),
      signal: AbortSignal.timeout(10_000), // just wait for 202 acknowledgement
    });

    if (!scanRes.ok) {
      const errText = await scanRes.text().catch(() => scanRes.statusText);
      return json({ data: null, error: `Playwright server error (${scanRes.status}): ${errText}` }, 502);
    }

    return json({
      data: { accepted: true, run_id, message: "Scan started — poll run status for updates" },
      error: null,
    }, 202);
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
