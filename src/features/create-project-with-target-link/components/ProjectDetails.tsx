import type { Project } from "../../../lib/api";

interface ProjectDetailsProps {
  project: Project;
  onBack?: () => void; // mobile only
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  idle:     { label: "No runs yet",  cls: "badge-idle",    dot: "dot-idle" },
  queued:   { label: "Queued",       cls: "badge-queued",  dot: "dot-queued" },
  running:  { label: "Running",      cls: "badge-running", dot: "dot-running" },
  passed:   { label: "Passed",       cls: "badge-passed",  dot: "dot-passed" },
  failed:   { label: "Failed",       cls: "badge-failed",  dot: "dot-failed" },
  canceled: { label: "Canceled",     cls: "badge-idle",    dot: "dot-idle" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectDetails({ project, onBack }: ProjectDetailsProps) {
  const meta = STATUS_META[project.status] ?? STATUS_META.idle;

  return (
    <div className="pdetail-panel">
      {/* Mobile back button */}
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
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pdetail-url"
            title={project.url}
          >
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
          <span className="pdetail-meta-label">ID</span>
          <code className="pdetail-id">{project.id.slice(0, 8)}…</code>
        </span>
      </div>

      {/* Placeholder for run creation — to be built in next feature */}
      <div className="pdetail-placeholder">
        <div className="pdetail-placeholder-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="1.2" opacity="0.25" />
            <circle cx="18" cy="18" r="9" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
            <circle cx="18" cy="18" r="3" fill="currentColor" opacity="0.6" />
            <line x1="18" y1="3" x2="18" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
            <line x1="18" y1="28" x2="18" y2="33" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
            <line x1="3" y1="18" x2="8" y2="18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
            <line x1="28" y1="18" x2="33" y2="18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
        <p className="pdetail-placeholder-title">Ready to test</p>
        <p className="pdetail-placeholder-body">
          Test run controls will appear here once the testing engine is set up.
          Make sure you&apos;ve added an API key in{" "}
          <a href="/settings" className="auth-link">Settings</a> first.
        </p>
      </div>
    </div>
  );
}
