import { useState } from "react";
import type { Project, Run, RunStep, ScopeMode } from "../../../lib/api";
import { buttonScan } from "../../../lib/api";
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

  const activeRun = latestRun;
  const hasActiveRun = activeRun?.status === "queued" || activeRun?.status === "running";

  // The run shown in the status panel and used for steps/logs tab
  const focusedRun = selectedRun ?? latestRun;

  // Fetch steps for the focused run so ButtonScanPanel can show results
  const { steps: focusedSteps } = useRunDetail(
    focusedRun?.scope_mode === "everything" ? (focusedRun?.id ?? null) : null
  );

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

  const handleSubmit = async (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => {
    setFormLoading(true);
    setFormError(null);
    const { run, error } = await createRun(scopeMode, instructions, featureDescription);
    setFormLoading(false);
    if (error) { setFormError(error); return; }
    setSelectedRun(null); // focus new run

    // Auto-trigger button scan for "Test everything" scope
    if (scopeMode === "everything" && run) {
      triggerButtonScan(run.id);
    }
  };

  const handleRerun = async () => {
    if (!focusedRun) return;
    setRerunLoading(true);
    const { run, error } = await createRun(
      focusedRun.scope_mode,
      focusedRun.instructions ?? undefined
    );
    setRerunLoading(false);
    if (!error) {
      setSelectedRun(null);
      // Re-trigger button scan for everything scope reruns
      if (focusedRun.scope_mode === "everything" && run) {
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
