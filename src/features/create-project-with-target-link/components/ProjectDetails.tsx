import { useState, useEffect, useRef } from "react";
import type { Project, Run, RunStep, ScopeMode } from "../../../lib/api";
import { buttonScan, runsFeaturePlan, featureExecutor, runsFeatureReport } from "../../../lib/api";
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { supabase } from "../../../lib/supabase";
import { useRuns, useRunDetail } from "../../projects-list-with-testing-status/lib/useRuns";
import RunCreateForm from "../../projects-list-with-testing-status/components/RunCreateForm";
import RunStatusPanel from "../../projects-list-with-testing-status/components/RunStatusPanel";
import RunTabs from "../../projects-list-with-testing-status/components/RunTabs";
import ButtonScanPanel from "../../test-app-buttons/components/ButtonScanPanel";

interface ProjectDetailsProps {
  project: Project;
  onBack?: () => void; // mobile only
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  idle:     { label: "No runs yet", cls: "badge-idle",    dot: "dot-idle"    },
  queued:   { label: "Queued",      cls: "badge-queued",  dot: "dot-queued"  },
  running:  { label: "Running",     cls: "badge-running", dot: "dot-running" },
  passed:   { label: "Passed",      cls: "badge-passed",  dot: "dot-passed"  },
  failed:   { label: "Failed",      cls: "badge-failed",  dot: "dot-failed"  },
  canceled: { label: "Canceled",    cls: "badge-idle",    dot: "dot-idle"    },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectDetails({ project, onBack }: ProjectDetailsProps) {
  const { runs, latestRun, loading: runsLoading, createRun, refresh } = useRuns(project.id);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  // Track which run IDs have already had their report generated so we don't re-fire
  const reportedRunIds = useRef<Set<string>>(new Set());

  const activeRun = latestRun;
  const hasActiveRun = activeRun?.status === "queued" || activeRun?.status === "running";

  // The run shown in the status panel and used for steps/logs tab
  const focusedRun = selectedRun ?? latestRun;

  // Fetch steps for the focused run so ButtonScanPanel can show results
  const { steps: focusedSteps } = useRunDetail(
    focusedRun?.scope_mode === "everything" ? (focusedRun?.id ?? null) : null
  );

  // ── Auto-generate Grok report when a feature run reaches a terminal state ────
  // The Playwright executor writes a plain-text summary; this upgrades it to
  // a full Markdown report (expected vs observed, failure links) via the LLM.
  useEffect(() => {
    const run = latestRun;
    if (!run) return;
    if (!run.feature_description) return;
    if (run.status !== "passed" && run.status !== "failed") return;
    if (reportedRunIds.current.has(run.id)) return;
    // Skip if the LLM report is already there (starts with ** from Markdown heading)
    if (run.summary?.startsWith("**") || run.summary?.startsWith("#")) return;
    // Skip needs_input runs — they were never executed
    if (run.summary?.startsWith("needs_input:")) return;

    reportedRunIds.current.add(run.id);
    runsFeatureReport(run.id).then(() => refresh()).catch(() => {});
  }, [latestRun?.id, latestRun?.status, latestRun?.summary, refresh]);

  const triggerButtonScan = async (runId: string) => {
    setScanLoading(true);
    const { error } = await buttonScan(runId);
    setScanLoading(false);
    if (error) {
      reportSelfHealError(supabase, {
        category: "frontend",
        source: "ProjectDetails",
        errorMessage: error,
        projectPrefix: "ai_qa_tester_",
        metadata: { action: "buttonScan", runId },
      });
    }
    refresh();
  };

  // ── Feature test: plan → execute ───────────────────────────────────────────
  const triggerFeatureTest = async (runId: string) => {
    // Step 1: planner generates structured test steps (synchronous AI call).
    // data.needs_input === true means the description was too vague —
    // the run stays queued and the UI will surface the clarification message
    // via RunStatusPanel. This is not a system error, so don't self-heal-report it.
    const { data: planData, error: planErr } = await runsFeaturePlan(runId);
    if (planData?.needs_input) {
      refresh();
      return;
    }
    if (planErr) {
      // Don't report expected business-logic outcomes as system errors
      const isExpectedError =
        planErr.startsWith("needs_input:") ||
        planErr.includes("no feature_description") ||
        planErr.includes("Run is already") ||
        planErr.includes("Run not found") ||
        planErr.includes("Unauthorized") ||
        planErr.includes("Missing Authorization");
      if (!isExpectedError) {
        reportSelfHealError(supabase, {
          category: "frontend",
          source: "ProjectDetails",
          errorMessage: planErr,
          projectPrefix: "ai_qa_tester_",
          metadata: { action: "runsFeaturePlan", runId },
        });
        // Infrastructure-level failure (non-2xx from Supabase gateway, timeout, etc.)
        // The edge function never ran, so the run stays "queued" forever — mark it failed.
        supabase
          .from("ai_qa_tester_qa_runs")
          .update({ status: "failed", error: `Feature planning failed: ${planErr}` })
          .eq("id", runId)
          .then(() => refresh());
        return;
      }
      refresh();
      return;
    }
    // Step 2: executor runs planned steps with Playwright (async 202)
    const { error: execErr } = await featureExecutor(runId);
    if (execErr) {
      reportSelfHealError(supabase, {
        category: "frontend",
        source: "ProjectDetails",
        errorMessage: execErr,
        projectPrefix: "ai_qa_tester_",
        metadata: { action: "featureExecutor", runId },
      });
    }
    refresh();
  };

  const handleSubmit = async (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => {
    setFormLoading(true);
    setFormError(null);
    const { run, error } = await createRun(scopeMode, instructions, featureDescription);
    setFormLoading(false);
    if (error) { setFormError(error); return; }
    setSelectedRun(null); // focus new run

    // Auto-trigger based on scope and feature_description
    if (run) {
      if (featureDescription) {
        // Feature description provided → run planner + executor
        triggerFeatureTest(run.id);
      } else if (scopeMode === "everything") {
        // No feature description → button scan
        triggerButtonScan(run.id);
      }
    }
  };

  const handleRerun = async () => {
    if (!focusedRun) return;
    setRerunLoading(true);
    const { run, error } = await createRun(
      focusedRun.scope_mode,
      focusedRun.instructions ?? undefined,
      focusedRun.feature_description ?? undefined,
    );
    setRerunLoading(false);
    if (!error && run) {
      setSelectedRun(null);
      if (focusedRun.feature_description) {
        triggerFeatureTest(run.id);
      } else if (focusedRun.scope_mode === "everything") {
        triggerButtonScan(run.id);
      }
    }
  };

  const latestStatus = latestRun?.status ?? project.status;
  const meta = STATUS_META[latestStatus] ?? STATUS_META.idle;

  return (
    <div className="pdetail-panel">
      {/* Mobile back */}
      {onBack && (
        <button className="pdetail-back" onClick={onBack} aria-label="Back to projects">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All projects
        </button>
      )}

      {/* Project header */}
      <div className="pdetail-header">
        <div className="pdetail-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
            <circle cx="10" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
            <circle cx="10" cy="10" r="1.8" fill="currentColor" />
          </svg>
        </div>
        <div className="pdetail-header-text">
          <h2 className="pdetail-name">{project.name}</h2>
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="pdetail-url" title={project.url}>
            {project.url}
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M2 9L9 2M9 2H5M9 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <div className={`plist-badge ${meta.cls} pdetail-status`}>
          <span className={`pdetail-dot ${meta.dot}`} />
          {meta.label}
        </div>
      </div>

      {/* Meta row */}
      <div className="pdetail-meta">
        <span>
          <span className="pdetail-meta-label">Created</span>
          {formatDate(project.created_at)}
        </span>
        <span>
          <span className="pdetail-meta-label">Updated</span>
          {formatDate(project.updated_at)}
        </span>
        <span>
          <span className="pdetail-meta-label">Runs</span>
          {runsLoading ? "…" : runs.length}
        </span>
        <span>
          <span className="pdetail-meta-label">ID</span>
          <code className="pdetail-id">{project.id.slice(0, 8)}…</code>
        </span>
      </div>

      {/* Start run form */}
      <RunCreateForm
        onSubmit={handleSubmit}
        loading={formLoading}
        error={formError}
        hasActiveRun={hasActiveRun}
      />

      {/* Button scan panel — shown for "Test everything" scope runs */}
      {focusedRun?.scope_mode === "everything" && (
        <ButtonScanPanel
          run={focusedRun}
          steps={focusedSteps as RunStep[]}
          onTriggerScan={() => triggerButtonScan(focusedRun.id)}
          scanLoading={scanLoading}
        />
      )}

      {/* Latest / focused run status */}
      {focusedRun && (
        <RunStatusPanel
          run={focusedRun}
          onRerun={handleRerun}
          rerunLoading={rerunLoading}
        />
      )}

      {/* Run history / steps / logs tabs */}
      <RunTabs
        runs={runs}
        runsLoading={runsLoading}
        activeRunId={focusedRun?.id ?? null}
        onSelectRun={(run) => setSelectedRun(run)}
      />
    </div>
  );
}
