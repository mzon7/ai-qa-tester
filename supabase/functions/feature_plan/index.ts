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
 * Guardrail: before planning, the description is assessed for clarity.
 * If it is too vague to produce meaningful test steps, the run stays in
 * "queued" status and its summary/error are set to a "needs_input:" message
 * that tells the user exactly what information to add.  The caller receives
 * a 422 with the same message so the UI can surface it without polling.
 *
 * The run itself is left in its current status when clarity passes; later
 * steps will transition it to "running" / "passed" / "failed".
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

interface ClarityResult {
  clear: boolean;
  /** Present when clear === false: plain-English feedback on what's missing. */
  feedback: string;
}

/**
 * Ask the LLM whether the feature description is specific enough to produce a
 * meaningful, executable test plan.  Returns immediately with a structured
 * verdict so we can abort early without wasting tokens on planning.
 *
 * A description is considered CLEAR when it names:
 *   1. A concrete UI behaviour (what the user does, e.g. "clicks Sign In")
 *   2. An observable outcome (what should happen, e.g. "redirected to /home")
 *
 * A description is considered VAGUE when it is:
 *   - A single generic word/phrase with no action or outcome ("login", "test my app")
 *   - Ambiguous about which page or component is under test
 *   - Missing any verifiable assertion ("make sure it works")
 */
async function checkClarity(
  featureDescription: string,
  targetUrl: string,
  apiKey: string,
): Promise<ClarityResult> {
  const prompt = `You are a QA planner evaluating whether a feature description is specific enough to generate automated browser tests.

Feature description: "${featureDescription}"
Target URL: ${targetUrl}

A description is CLEAR if it mentions:
- A concrete UI action (click, fill, navigate, submit, etc.)
- An observable outcome (redirect, message, element visible, etc.)

A description is VAGUE if it is a single generic phrase with no action or outcome, or if the expected behaviour is completely undefined.

Return ONLY valid JSON, no markdown:
{ "clear": true }
OR
{ "clear": false, "feedback": "<one concise sentence: what specific information the user must add, e.g. 'Please describe what action triggers the feature and what the expected outcome is (e.g. clicking X should show Y).'>" }`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // On API error, default to allowing the plan to proceed rather than
    // blocking the user with a false-negative.
    return { clear: true, feedback: "" };
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = (data.choices?.[0]?.message?.content ?? "")
    .replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parsed = JSON.parse(raw) as { clear: boolean; feedback?: string };
    return {
      clear: parsed.clear === true,
      feedback: parsed.feedback ?? "",
    };
  } catch {
    // Parse failure → default to allowing planning
    return { clear: true, feedback: "" };
  }
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
      // Return 200 so the SDK surfaces the error body; non-2xx is swallowed as a generic message.
      return json({ data: null, error: "Run has no feature_description — nothing to plan" }, 200);
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
  // ── Guardrail: reject vague descriptions before spending tokens on planning ──
  const clarity = await checkClarity(run.feature_description, targetUrl, apiKey);

  if (!clarity.clear) {
    const needsInputMessage =
      `needs_input: ${clarity.feedback || "Please provide more detail about the feature: describe what action to perform and what the expected outcome should be."}`;

    // Keep run in "queued" so the user can resubmit with a better description.
    // Write the clarification guidance into summary + error so it surfaces in
    // the UI without any additional polling.
    await supabase
      .from("ai_qa_tester_qa_runs")
      .update({
        summary: needsInputMessage,
        error: needsInputMessage,
      })
      .eq("id", run.id);

    await supabase
      .from("ai_qa_tester_qa_run_logs")
      .insert({
        run_id: run.id,
        ts: new Date().toISOString(),
        level: "warn",
        message: `feature_plan: description too vague to plan — ${needsInputMessage}`,
      });

    // Return 200 so callEdgeFunction propagates the body to the client.
    // A 422 would be swallowed as a generic error by the SDK wrapper.
    return json({ data: { needs_input: true, message: needsInputMessage }, error: null }, 200);
  }

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

    return json({ data: null, error: (err as Error).message }, 200);
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
