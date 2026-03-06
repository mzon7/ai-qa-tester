/**
 * projects_create — Edge Function
 *
 * Creates a new QA project for the authenticated user.
 * Server-side validates and normalises the target URL before insertion.
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

const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
];
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function validateUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Invalid URL format.";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return "URL must use http or https.";
  const h = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return "Localhost URLs are not supported.";
  if (PRIVATE_IP_PATTERNS.some((r) => r.test(h))) return "Private IP ranges are not supported.";
  return null;
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw.trim();
  }
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
    const { targetUrl, name } = body as { targetUrl: string; name?: string };

    if (!targetUrl?.trim()) {
      return json({ data: null, error: "targetUrl is required" }, 400);
    }

    const urlError = validateUrl(targetUrl.trim());
    if (urlError) return json({ data: null, error: urlError }, 400);

    const normalizedUrl = normalizeUrl(targetUrl);

    const { data: project, error: dbError } = await supabase
      .from("ai_qa_tester_projects")
      .insert({
        user_id: user.id,
        url: normalizedUrl,
        name: name?.trim() || normalizedUrl,
        status: "idle",
      })
      .select("id, user_id, name, url, status, created_at, updated_at")
      .single();

    if (dbError) {
      // Unique constraint: project with same URL already exists for user
      if (dbError.code === "23505") {
        const { data: existing } = await supabase
          .from("ai_qa_tester_projects")
          .select("id, user_id, name, url, status, created_at, updated_at")
          .eq("user_id", user.id)
          .eq("url", normalizedUrl)
          .single();
        if (existing) {
          return json({ data: { project: existing, existed: true }, error: null });
        }
      }
      return json({ data: null, error: dbError.message }, 500);
    }

    return json({ data: { project, existed: false }, error: null }, 201);
  } catch (err) {
    return json({ data: null, error: err?.message ?? "Unexpected error" }, 500);
  }
});
