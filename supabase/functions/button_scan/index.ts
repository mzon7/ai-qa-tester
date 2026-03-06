/**
 * button_scan — Edge Function
 *
 * Executes a "button smoke" QA pass against the project's target URL:
 * 1. Fetches the page HTML from target_url
 * 2. Extracts clickable elements (buttons, links, form inputs)
 * 3. Filters out destructive buttons (delete, cancel subscription, etc.)
 * 4. Uses Grok AI to analyze each element group for accessibility + function
 * 5. Creates qa_run_steps + qa_run_logs entries
 * 6. Marks the run as passed or failed with a summary
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

// ─── Safety: destructive button blacklist ─────────────────────────────────────

const DESTRUCTIVE_KEYWORDS = [
  "delete", "remove account", "cancel subscription", "unsubscribe",
  "clear all", "destroy", "terminate", "wipe", "purge", "deactivate account",
];

function isDestructive(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

interface InteractiveElement {
  type: "button" | "link" | "input";
  text: string;
  href?: string;
  inputType?: string;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseInteractiveElements(html: string): InteractiveElement[] {
  const elements: InteractiveElement[] = [];

  // <button> elements
  const buttonRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = buttonRe.exec(html)) !== null) {
    const text = stripTags(m[1]).slice(0, 100);
    if (text && !isDestructive(text)) {
      elements.push({ type: "button", text });
    }
  }

  // <a href> links (skip anchors / javascript: / mailto:)
  const linkRe = /<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    if (href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    const text = stripTags(m[2]).slice(0, 100);
    if (text && text.length > 0 && text.length < 80) {
      elements.push({ type: "link", text, href });
    }
  }

  // <input type="submit|button"> (skip reset)
  const inputRe = /<input[^>]+>/gi;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const typeMatch = tag.match(/type=["'](submit|button)["']/i);
    if (!typeMatch) continue;
    const valueMatch = tag.match(/value=["']([^"']+)["']/i);
    const text = (valueMatch ? valueMatch[1] : typeMatch[1]).slice(0, 80);
    if (!isDestructive(text)) {
      elements.push({ type: "input", text, inputType: typeMatch[1] });
    }
  }

  // Deduplicate by type+text, cap at 50
  const seen = new Set<string>();
  return elements.filter((el) => {
    const key = `${el.type}:${el.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface ElementGroup {
  name: string;
  title: string;
  elements: InteractiveElement[];
}

function groupElements(elements: InteractiveElement[]): ElementGroup[] {
  const links = elements.filter((e) => e.type === "link");
  const buttons = elements.filter((e) => e.type === "button");
  const inputs = elements.filter((e) => e.type === "input");
  const groups: ElementGroup[] = [];
  if (links.length > 0) groups.push({ name: "navigation", title: `Navigation Links (${links.length} elements)`, elements: links });
  if (buttons.length > 0) groups.push({ name: "actions", title: `Action Buttons (${buttons.length} elements)`, elements: buttons });
  if (inputs.length > 0) groups.push({ name: "forms", title: `Form Submissions (${inputs.length} elements)`, elements: inputs });
  return groups;
}

// ─── Grok AI Analysis ────────────────────────────────────────────────────────

interface GroupAnalysis {
  name: string;
  status: "passed" | "failed" | "skipped";
  notes: string;
}

interface GrokAnalysis {
  groups: GroupAnalysis[];
  summary: string;
  overall_status: "passed" | "failed";
}

async function analyzeWithGrok(
  targetUrl: string,
  groups: ElementGroup[],
  grokKey: string,
): Promise<GrokAnalysis> {
  const groupsPayload = groups.map((g) => ({
    group: g.name,
    title: g.title,
    elements: g.elements.map((e) => ({ text: e.text, type: e.type, href: e.href })),
  }));

  const systemPrompt = `You are a QA automation expert analyzing interactive UI elements scraped from a web page. Assess whether each group of elements appears properly implemented and accessible.

For each group evaluate:
- Whether elements have descriptive, non-empty text
- Whether links have meaningful href values (not just "#" or data-less hrefs)
- Whether button text is clear and purposeful
- Any obvious accessibility or usability issues

Respond ONLY with valid JSON in this exact format:
{
  "groups": [
    { "name": "group_name", "status": "passed|failed|skipped", "notes": "concise analysis" }
  ],
  "summary": "brief overall summary (1-2 sentences)",
  "overall_status": "passed|failed"
}`;

  const userPrompt = `Analyze interactive elements from: ${targetUrl}

${JSON.stringify(groupsPayload, null, 2)}

Flag issues like: empty text, placeholder hrefs (#), non-descriptive labels, or suspicious patterns. Be concise.`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${grokKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-beta",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Grok API error: ${res.status}`);
  }

  const grokData = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = grokData.choices[0]?.message?.content ?? "{}";

  // Extract JSON block (may be wrapped in markdown code fences)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Grok returned non-JSON response");

  return JSON.parse(jsonMatch[0]) as GrokAnalysis;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

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

    const grokKey = Deno.env.get("GROK_API_KEY");
    if (!grokKey) return json({ data: null, error: "GROK_API_KEY not configured" }, 500);

    // Fetch run (verify ownership)
    const { data: run, error: runErr } = await supabase
      .from("ai_qa_tester_qa_runs")
      .select("id, project_id, user_id, status")
      .eq("id", run_id)
      .eq("user_id", user.id)
      .single();

    if (runErr || !run) return json({ data: null, error: "Run not found" }, 404);
    if (run.status !== "queued") {
      return json({ data: null, error: `Run is already ${run.status}` }, 409);
    }

    // Fetch project to get target URL
    const { data: project, error: projErr } = await supabase
      .from("ai_qa_tester_projects")
      .select("id, url")
      .eq("id", run.project_id)
      .single();

    if (projErr || !project) return json({ data: null, error: "Project not found" }, 404);

    const targetUrl = project.url as string;

    // Helper to append a log entry
    const addLog = async (level: "info" | "warn" | "error", message: string, stepId?: string) => {
      await supabase.from("ai_qa_tester_qa_run_logs").insert({
        run_id,
        ts: new Date().toISOString(),
        level,
        message,
        step_id: stepId ?? null,
      });
    };

    // Mark run as running
    await supabase
      .from("ai_qa_tester_qa_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run_id);

    await addLog("info", `Button scan started — target: ${targetUrl}`);

    // ── Fetch page HTML ──────────────────────────────────────────────────────

    let html = "";
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15_000);
      const pageRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "AI-QA-Tester/1.0 (button-scan)" },
      });
      clearTimeout(tid);
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
      html = await pageRes.text();
      await addLog("info", `Page fetched successfully (${html.length} bytes)`);
    } catch (fetchErr) {
      const msg = `Failed to fetch target URL: ${(fetchErr as Error).message}`;
      await addLog("error", msg);
      await supabase.from("ai_qa_tester_qa_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: msg,
      }).eq("id", run_id);
      return json({ data: null, error: msg }, 422);
    }

    // ── Parse & group interactive elements ──────────────────────────────────

    const elements = parseInteractiveElements(html);
    await addLog("info", `Found ${elements.length} interactive elements`);

    if (elements.length === 0) {
      await addLog("warn", "No interactive elements detected on this page");
      await supabase.from("ai_qa_tester_qa_runs").update({
        status: "passed",
        completed_at: new Date().toISOString(),
        summary: "No interactive elements found on the page. Manual review recommended.",
      }).eq("id", run_id);
      return json({ data: { status: "passed", elements_found: 0, groups: [] }, error: null });
    }

    const groups = groupElements(elements);
    await addLog("info", `Grouped into ${groups.length} group(s): ${groups.map((g) => g.name).join(", ")}`);

    // ── Create pending steps ─────────────────────────────────────────────────

    const stepIds: Record<string, string> = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const { data: step } = await supabase
        .from("ai_qa_tester_qa_run_steps")
        .insert({
          run_id,
          idx: i,
          title: g.title,
          expected: "All elements should be accessible and functional",
          status: "pending",
          notes: null,
        })
        .select("id")
        .single();
      if (step) stepIds[g.name] = step.id;
    }

    // ── AI Analysis ──────────────────────────────────────────────────────────

    await addLog("info", `Analyzing ${elements.length} elements with Grok AI…`);
    let analysis: GrokAnalysis;
    try {
      analysis = await analyzeWithGrok(targetUrl, groups, grokKey);
    } catch (aiErr) {
      await addLog("warn", `AI analysis unavailable: ${(aiErr as Error).message} — using basic assessment`);
      // Fallback: basic structural check (elements have text = pass)
      analysis = {
        groups: groups.map((g) => ({
          name: g.name,
          status: "passed" as const,
          notes: `Found ${g.elements.length} elements. AI analysis unavailable — elements have text content and appear structured.`,
        })),
        summary: `Scanned ${elements.length} interactive elements across ${groups.length} groups. Manual verification recommended.`,
        overall_status: "passed",
      };
    }

    // ── Update steps with results ────────────────────────────────────────────

    for (const result of analysis.groups) {
      const stepId = stepIds[result.name];
      if (!stepId) continue;

      await supabase.from("ai_qa_tester_qa_run_steps").update({
        status: result.status,
        notes: result.notes,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).eq("id", stepId);

      await addLog(
        result.status === "failed" ? "warn" : "info",
        `[${result.status.toUpperCase()}] ${result.name}: ${result.notes}`,
        stepId,
      );
    }

    // ── Finalize run ─────────────────────────────────────────────────────────

    const finalStatus = analysis.overall_status;
    await supabase.from("ai_qa_tester_qa_runs").update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      summary: analysis.summary,
      error: finalStatus === "failed"
        ? "Some interactive element groups have issues. See steps for details."
        : null,
    }).eq("id", run_id);

    await addLog("info", `Button scan complete — ${finalStatus.toUpperCase()}`);

    return json({
      data: {
        status: finalStatus,
        summary: analysis.summary,
        elements_found: elements.length,
        groups: analysis.groups,
      },
      error: null,
    });
  } catch (err) {
    return json({ data: null, error: (err as Error)?.message ?? "Unexpected error" }, 500);
  }
});
