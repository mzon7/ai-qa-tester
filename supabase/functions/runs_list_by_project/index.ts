/**
 * runs_list_by_project — Edge Function
 *
 * Returns all runs for a given project, newest first.
 * Verifies the project belongs to the authenticated user.
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 200);

    const body = await req.json();
    const { project_id } = body as { project_id: string };

    if (!project_id?.trim()) {
      return json({ data: null, error: "project_id is required" });
    }

    // Verify the project belongs to this user
    const { data: project, error: projError } = await supabase
      .from("ai_qa_tester_projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projError || !project) {
      return json({ data: null, error: "Project not found" });
    }

    const { data: runs, error: runsError } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, user_id, status, scope_mode, instructions, feature_description, started_at, completed_at, summary, error, created_at")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsError) return json({ data: null, error: runsError.message });

    return json({ data: { runs: runs ?? [] }, error: null });
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" });
  }
});
