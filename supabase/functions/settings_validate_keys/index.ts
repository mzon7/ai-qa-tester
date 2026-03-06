/**
 * settings_validate_keys — Edge Function
 *
 * Decrypts the stored API key and makes a minimal test call to the provider
 * to verify the key is valid. Returns { valid: boolean, message: string }.
 * Rate limited: max 5 calls per minute per user (enforced via simple in-memory map in dev;
 * use Upstash or similar for production).
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

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function decryptKey(encrypted: string, secret: string): Promise<string> {
  const cryptoKey = await deriveKey(secret);
  const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );
  return new TextDecoder().decode(plain);
}

async function validateGrok(apiKey: string): Promise<{ valid: boolean; message: string }> {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { valid: true, message: "Grok API key is valid" };
  if (res.status === 401) return { valid: false, message: "Invalid API key — authentication failed" };
  return { valid: false, message: `Unexpected response from Grok (${res.status})` };
}

async function validateOpenAI(apiKey: string): Promise<{ valid: boolean; message: string }> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { valid: true, message: "OpenAI API key is valid" };
  if (res.status === 401) return { valid: false, message: "Invalid API key — authentication failed" };
  return { valid: false, message: `Unexpected response from OpenAI (${res.status})` };
}

// Simple in-memory rate limiter (per function instance; use Redis for prod)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
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

    // Rate limiting
    if (isRateLimited(user.id)) {
      return json({ data: null, error: "Rate limit exceeded. Try again in 1 minute." }, 429);
    }

    // Fetch encrypted key
    const { data: settings, error: dbError } = await supabase
      .from("ai_qa_tester_qa_settings")
      .select("llm_provider, llm_api_key_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) return json({ data: null, error: dbError.message }, 500);
    if (!settings?.llm_api_key_encrypted) {
      return json({ data: { valid: false, message: "No API key saved. Save a key first." }, error: null });
    }

    // Decrypt
    const encryptionSecret = Deno.env.get("API_KEY_SECRET") ?? "default-dev-secret-change-me";
    let apiKey: string;
    try {
      apiKey = await decryptKey(settings.llm_api_key_encrypted, encryptionSecret);
    } catch {
      return json({ data: { valid: false, message: "Failed to decrypt stored key. Re-save your key." }, error: null });
    }

    // Validate against provider
    let result: { valid: boolean; message: string };
    if (settings.llm_provider === "grok") {
      result = await validateGrok(apiKey);
    } else if (settings.llm_provider === "openai") {
      result = await validateOpenAI(apiKey);
    } else {
      result = { valid: false, message: `Unknown provider: ${settings.llm_provider}` };
    }

    return json({ data: result, error: null });
  } catch (err) {
    return json({ data: null, error: err?.message ?? "Unexpected error" }, 500);
  }
});
