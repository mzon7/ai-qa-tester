/**
 * feature_report — Edge Function
 *
 * Generates a structured test report for a completed feature run.
 * For each qa_run_step it compares:
 *   - expected  → the assertion defined by the planner
 *   - observed  → step.notes (written by the executor)
 *   - status    → passed | failed | skipped
 *
 * For every failed step it fetches signed URLs (60 min TTL) for any
 * qa_artifacts (screenshots, traces, etc.) attached to that step.
 *
 * Uses Grok to produce a concise Markdown summary, then writes it to
 * qa_runs.summary.  Returns the full structured report to the caller.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARTIFACT_TTL_SECONDS = 3600; // 1 hour signed URL TTL

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface ReportStepResult {
  idx: number;
  title: string;
  expected: string | null;
  observed: string | null;
  status: string;
  artifacts: Array<{ type: string; url: string }>;
}

// ── LLM summary generation ─────────────────────────────────────────────────────

async function generateSummary(
  featureDescription: string,
  steps: ReportStepResult[],
  overallStatus: string,
  apiKey: string,
): Promise<string> {
  const passCount = steps.filter((s) => s.status === "passed").length;
  const failCount = steps.filter((s) => s.status === "failed").length;
  const skipCount = steps.filter((s) => s.status === "skipped").length;

  const stepsText = steps
    .map((s, i) => {
      const icon = s.status === "passed" ? "✅" : s.status === "failed" ? "❌" : "⏭️";
      const artifactNote = s.artifacts.length > 0
        ? `\n      Artifacts: ${s.artifacts.map((a) => `[${a.type}](${a.url})`).join(", ")}`
        : "";
      return `Step ${i + 1}: ${icon} ${s.title}
      Expected: ${s.expected ?? "(none)"}
      Observed: ${s.observed ?? "(no notes recorded)"}${artifactNote}`;
    })
    .join("\n\n");

  const prompt = `You are a senior QA engineer writing a concise test report.

Feature tested: ${featureDescription}
Overall result: ${overallStatus.toUpperCase()} (${passCount} passed, ${failCount} failed, ${skipCount} skipped)

Step results:
${stepsText}

Write a clear, professional Markdown report with these sections:
1. **Summary** — one paragraph overall verdict
2. **Step Results** — table with columns: Step | Action | Expected | Observed | Status
3. **Failures** — bullet list of failures with root cause analysis (omit if none)
4. **Recommendation** — one sentence on next action

Rules:
- Be concise and factual
- For failures, reference the observed notes to explain what went wrong
- If there are artifact links in the step data, include them in the Failures section as [screenshot](url)
- Use Markdown formatting throughout`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Grok API error (${res.status}): ${errText}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "No summary generated.";
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

    // ── Fetch run ────────────────────────────────────────────────────────────
    const { data: run, error: runErr } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, user_id, status, feature_description, instructions, summary")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runErr || !run) return json({ data: null, error: "Run not found" }, 404);

    if (!["passed", "failed", "canceled"].includes(run.status)) {
      return json({
        data: null,
        error: `Run is still ${run.status} — wait for it to complete before generating a report`,
      }, 409);
    }

    if (!run.feature_description?.trim()) {
      return json({ data: null, error: "Run has no feature_description — nothing to report on" }, 422);
    }

    // ── Fetch steps ──────────────────────────────────────────────────────────
    const { data: steps, error: stepsErr } = await supabase
      .from("ai_qa_tester_qa_run_steps")
      .select("id, idx, title, expected, status, notes")
      .eq("run_id", run_id)
      .order("idx", { ascending: true });

    if (stepsErr) return json({ data: null, error: `Failed to fetch steps: ${stepsErr.message}` }, 500);

    if (!steps || steps.length === 0) {
      return json({ data: null, error: "No test steps found for this run — was the plan generated?" }, 422);
    }

    // ── Fetch artifacts for failed steps ────────────────────────────────────
    const failedStepIds = steps
      .filter((s) => s.status === "failed")
      .map((s) => s.id);

    const artifactsByStepId: Record<string, Array<{ type: string; url: string }>> = {};

    if (failedStepIds.length > 0) {
      const { data: artifacts } = await supabase
        .from("ai_qa_tester_qa_artifacts")
        .select("id, step_id, type, storage_path")
        .eq("run_id", run_id)
        .in("step_id", failedStepIds);

      if (artifacts) {
        for (const artifact of artifacts) {
          if (!artifact.step_id || !artifact.storage_path) continue;

          const { data: signed } = await supabase.storage
            .from("qa-artifacts")
            .createSignedUrl(artifact.storage_path, ARTIFACT_TTL_SECONDS);

          if (!signed?.signedUrl) continue;

          if (!artifactsByStepId[artifact.step_id]) {
            artifactsByStepId[artifact.step_id] = [];
          }
          artifactsByStepId[artifact.step_id].push({
            type: artifact.type,
            url: signed.signedUrl,
          });
        }
      }
    }

    // ── Build structured step results ────────────────────────────────────────
    const stepResults: ReportStepResult[] = steps.map((step) => ({
      idx: step.idx,
      title: step.title,
      expected: step.expected ?? null,
      observed: step.notes ?? null,
      status: step.status,
      artifacts: artifactsByStepId[step.id] ?? [],
    }));

    // ── Resolve Grok API key ─────────────────────────────────────────────────
    const grokApiKey = Deno.env.get("GROK_API_KEY") ?? null;

    let resolvedKey = grokApiKey;

    if (!resolvedKey) {
      const { data: settings } = await supabase
        .from("ai_qa_tester_qa_settings")
        .select("llm_api_key_encrypted")
        .eq("user_id", user.id)
        .single();

      if (!settings?.llm_api_key_encrypted) {
        return json({
          data: null,
          error: "No API key configured. Add a Grok key in Settings or set GROK_API_KEY.",
        }, 503);
      }

      const secret = Deno.env.get("API_KEY_SECRET");
      if (!secret) {
        return json({ data: null, error: "Server configuration error: API_KEY_SECRET not set" }, 503);
      }

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

      const iv = Uint8Array.from(ivHex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
      const encData = Uint8Array.from(encHex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));

      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, encData);
        resolvedKey = new TextDecoder().decode(plain);
      } catch {
        return json({ data: null, error: "Failed to decrypt stored API key" }, 500);
      }
    }

    // ── Generate Markdown summary via Grok ───────────────────────────────────
    let markdownSummary: string;
    try {
      markdownSummary = await generateSummary(
        run.feature_description,
        stepResults,
        run.status,
        resolvedKey!,
      );
    } catch (err) {
      // Fallback: plain-text summary without LLM
      const failCount = stepResults.filter((s) => s.status === "failed").length;
      markdownSummary = `**Run ${run.status.toUpperCase()}** — ${stepResults.length} step(s), ${failCount} failure(s).\n\n_LLM summary unavailable: ${(err as Error).message}_`;
    }

    // ── Store summary on the run ─────────────────────────────────────────────
    await supabase
      .from("ai_qa_tester_qa_runs")
      .update({ summary: markdownSummary })
      .eq("id", run_id);

    // ── Log report generation ────────────────────────────────────────────────
    await supabase
      .from("ai_qa_tester_qa_run_logs")
      .insert({
        run_id,
        ts: new Date().toISOString(),
        level: "info",
        message: `feature_report: report generated (${stepResults.length} steps, ${stepResults.filter((s) => s.status === "failed").length} failures)`,
      });

    return json({
      data: {
        run_id,
        overall_status: run.status,
        summary: markdownSummary,
        steps: stepResults,
        totals: {
          total: stepResults.length,
          passed: stepResults.filter((s) => s.status === "passed").length,
          failed: stepResults.filter((s) => s.status === "failed").length,
          skipped: stepResults.filter((s) => s.status === "skipped").length,
        },
      },
      error: null,
    });
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
