/**
 * settings_save_keys — Edge Function
 *
 * Receives { provider, api_key } from an authenticated client.
 * Encrypts the key with AES-GCM using a server-side secret,
 * upserts into ai_qa_tester_qa_settings, and returns only the hint (last 4 chars).
 * The raw key is NEVER returned to the client.
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

async function encryptKey(apiKey: string, secret: string): Promise<string> {
  const cryptoKey = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(apiKey)
  );
  const combined = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    // Authenticate request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Missing Authorization header" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ data: null, error: "Unauthorized" }, 200);

    const body = await req.json();
    const { provider, api_key } = body as { provider: string; api_key: string };

    if (!provider || !api_key) {
      return json({ data: null, error: "provider and api_key are required" }, 400);
    }

    const validProviders = ["grok", "openai"];
    if (!validProviders.includes(provider)) {
      return json({ data: null, error: `provider must be one of: ${validProviders.join(", ")}` }, 400);
    }

    // Encrypt the key
    const encryptionSecret = Deno.env.get("API_KEY_SECRET") ?? "default-dev-secret-change-me";
    const encrypted = await encryptKey(api_key, encryptionSecret);
    const hint = api_key.slice(-4);

    // Upsert settings
    const { error: dbError } = await supabase
      .from("ai_qa_tester_qa_settings")
      .upsert({
        user_id: user.id,
        llm_provider: provider,
        llm_api_key_encrypted: encrypted,
        llm_api_key_hint: hint,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (dbError) return json({ data: null, error: dbError.message }, 500);

    return json({ data: { hint, provider }, error: null });
  } catch (err) {
    return json({ data: null, error: err?.message ?? "Unexpected error" }, 500);
  }
});
