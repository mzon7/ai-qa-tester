/**
 * feature_plan — Edge Function
 *
 * Given a run that has a feature_description, uses the Grok LLM to devise a
 * bounded, structured test plan (≤ MAX_STEPS steps).  Each step is stored as a
 * "pending" row in ai_qa_tester_qa_run_steps with:
 *   title    → short action label (e.g. "Click the Sign-In button")
 *   expected → assertion to verify after the action
 *   notes    → JSON with { action, assertion, selector_hints }
 *
 * The run itself is left in its current status; later steps will transition it
 * to "running" / "passed" / "failed".
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_STEPS = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface PlanStep {
  action: string;
  assertion: string;
  selector_hints: string[];
}

async function generatePlan(
  targetUrl: string,
  featureDescription: string,
  instructions: string | null,
  apiKey: string,
): Promise<PlanStep[]> {
  const systemPrompt =
    `You are a senior QA engineer. Your job is to create a precise, bounded test plan for a web feature.
Return ONLY valid JSON in this exact shape — no markdown, no prose:
{
  "steps": [
    {
      "action": "<imperative sentence: what to do, e.g. 'Navigate to the login page'>",
      "assertion": "<what to verify after the action, e.g. 'The login form is visible'>",
      "selector_hints": ["<CSS selector or visible text hint>", ...]
    }
  ]
}
Rules:
- Maximum ${MAX_STEPS} steps; cover only what is described.
- Each action must be a single, atomic UI interaction.
- selector_hints should be CSS selectors, ARIA roles, or visible text (at least one per step).
- assertions must be observable in the browser (visible text, URL change, element state).`;

  const userContent = [
    `Target URL: ${targetUrl}`,
    `Feature description: ${featureDescription}`,
    instructions ? `Additional instructions: ${instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Grok API error (${res.status}): ${errText}`);
  }

  const grokData = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = grokData.choices?.[0]?.message?.content ?? "";

  // Strip any accidental markdown fences
  const jsonStr = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed: { steps: PlanStep[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("LLM returned empty or malformed steps array");
  }

  return parsed.steps.slice(0, MAX_STEPS);
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

    // ── Fetch run + project ───────────────────────────────────────────────────
    const { data: run, error: runErr } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, user_id, status, scope_mode, instructions, feature_description")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runErr || !run) return json({ data: null, error: "Run not found" }, 404);

    if (!run.feature_description?.trim()) {
      return json({ data: null, error: "Run has no feature_description — nothing to plan" }, 422);
    }

    const { data: project, error: projErr } = await supabase
      .from("ai_qa_tester_projects")
      .select("url")
      .eq("id", run.project_id)
      .single();

    if (projErr || !project) return json({ data: null, error: "Project not found" }, 404);

    // ── Resolve Grok API key ──────────────────────────────────────────────────
    // First try the edge function env var (for server-level key), then fall
    // back to the user's encrypted key stored in settings.
    const grokApiKey = Deno.env.get("GROK_API_KEY") ?? null;

    if (!grokApiKey) {
      // Try to fetch the user's stored key
      const { data: settings } = await supabase
        .from("ai_qa_tester_qa_settings")
        .select("llm_api_key_encrypted, llm_provider")
        .eq("user_id", user.id)
        .single();

      if (!settings?.llm_api_key_encrypted) {
        return json({
          data: null,
          error: "No API key configured. Add a Grok key in Settings or set GROK_API_KEY.",
        }, 503);
      }

      // Decrypt via the settings helper (re-use the decryption logic inline)
      const secret = Deno.env.get("API_KEY_SECRET");
      if (!secret) {
        return json({ data: null, error: "Server configuration error: API_KEY_SECRET not set" }, 503);
      }

      // Inline AES-256-GCM decryption (same approach as settings_validate_keys)
      const enc = settings.llm_api_key_encrypted as string;
      const [ivHex, encHex] = enc.split(":");
      if (!ivHex || !encHex) {
        return json({ data: null, error: "Stored key is malformed" }, 500);
      }

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );

      const iv = Uint8Array.from(ivHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
      const encData = Uint8Array.from(encHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

      let decrypted: string;
      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, encData);
        decrypted = new TextDecoder().decode(plain);
      } catch {
        return json({ data: null, error: "Failed to decrypt stored API key" }, 500);
      }

      return await doPlan(supabase, run, project.url, decrypted);
    }

    return await doPlan(supabase, run, project.url, grokApiKey);
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});

async function doPlan(
  supabase: ReturnType<typeof createClient>,
  run: {
    id: string;
    scope_mode: string;
    instructions: string | null;
    feature_description: string;
  },
  targetUrl: string,
  apiKey: string,
) {
  // ── Delete any existing steps for this run (idempotent re-plan) ─────────────
  await supabase
    .from("ai_qa_tester_qa_run_steps")
    .delete()
    .eq("run_id", run.id);

  // ── Generate plan via Grok ──────────────────────────────────────────────────
  let planSteps: PlanStep[];
  try {
    planSteps = await generatePlan(
      targetUrl,
      run.feature_description,
      run.instructions,
      apiKey,
    );
  } catch (err) {
    // Log the error to the run and mark it failed
    await supabase
      .from("ai_qa_tester_qa_run_logs")
      .insert({
        run_id: run.id,
        ts: new Date().toISOString(),
        level: "error",
        message: `feature_plan: ${(err as Error).message}`,
      });

    await supabase
      .from("ai_qa_tester_qa_runs")
      .update({ status: "failed", error: (err as Error).message })
      .eq("id", run.id);

    return json({ data: null, error: (err as Error).message }, 502);
  }

  // ── Insert steps as "pending" ───────────────────────────────────────────────
  const rows = planSteps.map((step, idx) => ({
    run_id: run.id,
    idx,
    title: step.action,
    expected: step.assertion,
    status: "pending",
    notes: JSON.stringify({ selector_hints: step.selector_hints }),
  }));

  const { error: insertErr } = await supabase
    .from("ai_qa_tester_qa_run_steps")
    .insert(rows);

  if (insertErr) {
    return json({ data: null, error: `Failed to store plan steps: ${insertErr.message}` }, 500);
  }

  // ── Log plan creation ───────────────────────────────────────────────────────
  await supabase
    .from("ai_qa_tester_qa_run_logs")
    .insert({
      run_id: run.id,
      ts: new Date().toISOString(),
      level: "info",
      message: `feature_plan: generated ${planSteps.length} test step(s) from feature description`,
    });

  return json({
    data: {
      run_id: run.id,
      steps_created: planSteps.length,
      steps: planSteps,
    },
    error: null,
  }, 200);
}
