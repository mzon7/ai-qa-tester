/**
 * settings_get — Edge Function
 *
 * Returns the current settings for the authenticated user.
 * NEVER returns the raw or encrypted API key — only provider, hint, and preferences.
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

    const { data, error: dbError } = await supabase
      .from("ai_qa_tester_qa_settings")
      .select("llm_provider, llm_api_key_hint, memory_retention_days, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) return json({ data: null, error: dbError.message }, 500);

    return json({
      data: data
        ? {
            provider: data.llm_provider,
            key_hint: data.llm_api_key_hint,
            key_set: !!data.llm_api_key_hint,
            memory_retention_days: data.memory_retention_days,
            updated_at: data.updated_at,
          }
        : null,
      error: null,
    });
  } catch (err) {
    return json({ data: null, error: err?.message ?? "Unexpected error" }, 500);
  }
});
