import { useState } from "react";
import type { Project } from "../../../lib/api";

interface ProjectsListProps {
  projects: Project[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (project: Project) => void;
  onCreateClick: () => void;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  idle:     { label: "No runs",  cls: "badge-idle",    dot: "dot-idle"    },
  queued:   { label: "Queued",   cls: "badge-queued",  dot: "dot-queued"  },
  running:  { label: "Running",  cls: "badge-running", dot: "dot-running" },
  passed:   { label: "Passed",   cls: "badge-passed",  dot: "dot-passed"  },
  failed:   { label: "Failed",   cls: "badge-failed",  dot: "dot-failed"  },
  canceled: { label: "Canceled", cls: "badge-idle",    dot: "dot-idle"    },
};

function hostname(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectsList({
  projects = [],
  loading,
  error,
  selectedId,
  onSelect,
  onCreateClick,
}: ProjectsListProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.url.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  return (
    <div className="plist-panel">
      {/* Header */}
      <div className="plist-header">
        <h2 className="plist-title">Projects</h2>
        <button
          className="plist-create-btn"
          onClick={onCreateClick}
          aria-label="Create new project"
          title="Create new project"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New
        </button>
      </div>

      {/* Search */}
      <div className="plist-search-wrap">
        <svg className="plist-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8.8" y1="8.8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="plist-search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search projects"
        />
      </div>

      {/* List */}
      <div className="plist-items" role="listbox" aria-label="Projects">
        {loading && (
          <div className="plist-empty">
            <span className="auth-spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="plist-empty plist-error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
              <line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.8" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="plist-empty">
            {projects.length === 0 ? (
              <>
                <div className="plist-empty-icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
                    <path d="M9 14h10M14 9v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
                  </svg>
                </div>
                <p>No projects yet.</p>
                <button className="plist-empty-create" onClick={onCreateClick}>
                  Create your first project →
                </button>
              </>
            ) : (
              <p>No projects match &ldquo;{search}&rdquo;</p>
            )}
          </div>
        )}

        {!loading &&
          filtered.map((project) => {
            // Prefer the latest run status over the project's own status field
            const statusKey = project.latest_run_status ?? project.status;
            const meta = STATUS_META[statusKey] ?? STATUS_META.idle;
            const isSelected = project.id === selectedId;
            const lastActivity = project.last_run_at ?? project.updated_at;
            return (
              <button
                key={project.id}
                role="option"
                aria-selected={isSelected}
                className={`plist-item${isSelected ? " plist-item-active" : ""}`}
                onClick={() => onSelect(project)}
              >
                <div className="plist-item-main">
                  <span className="plist-item-name">{project.name}</span>
                  <span className={`plist-badge ${meta.cls} plist-badge-dot`}>
                    <span className={`pdetail-dot ${meta.dot}`} aria-hidden="true" />
                    {meta.label}
                  </span>
                </div>
                <div className="plist-item-sub">
                  <span className="plist-item-url">{hostname(project.url)}</span>
                  <span className="plist-item-time">{timeAgo(lastActivity)}</span>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
