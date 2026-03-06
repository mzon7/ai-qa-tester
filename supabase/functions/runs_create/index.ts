/**
 * runs_create — Edge Function
 *
 * Creates a new QA run for the given project.
 * Validates project ownership, then inserts a queued run.
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 401);

    const body = await req.json();
    const { project_id, scope_mode = "everything", instructions } = body as {
      project_id: string;
      scope_mode?: "everything" | "instructions";
      instructions?: string;
    };

    if (!project_id?.trim()) {
      return json({ data: null, error: "project_id is required" }, 400);
    }
    if (!["everything", "instructions"].includes(scope_mode)) {
      return json({ data: null, error: "scope_mode must be 'everything' or 'instructions'" }, 400);
    }
    if (scope_mode === "instructions" && !instructions?.trim()) {
      return json({ data: null, error: "instructions are required when scope_mode is 'instructions'" }, 400);
    }

    // Verify the project belongs to this user
    const { data: project, error: projError } = await supabase
      .from("ai_qa_tester_projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projError || !project) {
      return json({ data: null, error: "Project not found" }, 404);
    }

    // Create the run
    const { data: run, error: runError } = await supabase
      .from("ai_qa_tester_qa_runs")
      .insert({
        project_id,
        user_id: user.id,
        status: "queued",
        scope_mode,
        instructions: scope_mode === "instructions" ? instructions?.trim() : null,
      })
      .select("id, project_id, user_id, status, scope_mode, instructions, started_at, completed_at, summary, error, created_at")
      .single();

    if (runError) return json({ data: null, error: runError.message }, 500);

    return json({ data: { run }, error: null }, 201);
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
