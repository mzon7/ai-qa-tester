import { useState } from "react";
import type { Project, Run, ScopeMode } from "../../../lib/api";
import { useRuns } from "../../projects-list-with-testing-status/lib/useRuns";
import RunCreateForm from "../../projects-list-with-testing-status/components/RunCreateForm";
import RunStatusPanel from "../../projects-list-with-testing-status/components/RunStatusPanel";
import RunTabs from "../../projects-list-with-testing-status/components/RunTabs";

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
  const { runs, latestRun, loading: runsLoading, createRun } = useRuns(project.id);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rerunLoading, setRerunLoading] = useState(false);

  const activeRun = latestRun;
  const hasActiveRun = activeRun?.status === "queued" || activeRun?.status === "running";

  // The run shown in the status panel and used for steps/logs tab
  const focusedRun = selectedRun ?? latestRun;

  const handleSubmit = async (scopeMode: ScopeMode, instructions?: string) => {
    setFormLoading(true);
    setFormError(null);
    const { error } = await createRun(scopeMode, instructions);
    setFormLoading(false);
    if (error) { setFormError(error); return; }
    setSelectedRun(null); // focus new run
  };

  const handleRerun = async () => {
    if (!focusedRun) return;
    setRerunLoading(true);
    const { error } = await createRun(
      focusedRun.scope_mode,
      focusedRun.instructions ?? undefined
    );
    setRerunLoading(false);
    if (!error) setSelectedRun(null);
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
