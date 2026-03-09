/**
 * projects_list — Edge Function
 *
 * Returns all projects for the authenticated user, newest first.
 * Each project is enriched with its latest run status and timestamp.
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
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch projects
    const { data: projects, error: dbError } = await supabase
      .from("ai_qa_tester_projects")
      .select("id, user_id, name, url, status, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (dbError) return json({ data: null, error: dbError.message }, 500);
    if (!projects || projects.length === 0) {
      return json({ data: { projects: [] }, error: null });
    }

    // Fetch latest run per project (one query, then pick latest per project in JS)
    const projectIds = projects.map((p: { id: string }) => p.id);
    const { data: runs } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, status, scope_mode, created_at")
      .in("project_id", projectIds)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Map projectId → latest run
    const latestRunMap = new Map<string, { id: string; status: string; created_at: string }>();
    for (const run of (runs ?? [])) {
      if (!latestRunMap.has(run.project_id)) {
        latestRunMap.set(run.project_id, run);
      }
    }

    // Merge
    const enriched = projects.map((p: { id: string; [key: string]: unknown }) => {
      const lr = latestRunMap.get(p.id);
      return {
        ...p,
        latest_run_id: lr?.id ?? null,
        latest_run_status: lr?.status ?? null,
        last_run_at: lr?.created_at ?? null,
      };
    });

    return json({ data: { projects: enriched }, error: null });
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
