import type { Run } from "../../../lib/api";

interface RunHistoryListProps {
  runs: Run[];
  selectedRunId: string | null;
  onSelect: (run: Run) => void;
}

const STATUS_CONFIG: Record<string, { label: string; dotCls: string; badgeCls: string }> = {
  queued:   { label: "Queued",   dotCls: "dot-queued",  badgeCls: "badge-queued"  },
  running:  { label: "Running",  dotCls: "dot-running", badgeCls: "badge-running" },
  passed:   { label: "Passed",   dotCls: "dot-passed",  badgeCls: "badge-passed"  },
  failed:   { label: "Failed",   dotCls: "dot-failed",  badgeCls: "badge-failed"  },
  canceled: { label: "Canceled", dotCls: "dot-idle",    badgeCls: "badge-idle"    },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function duration(run: Run) {
  if (!run.started_at || !run.completed_at) return null;
  const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function RunHistoryList({ runs, selectedRunId, onSelect }: RunHistoryListProps) {
  if (runs.length === 0) {
    return (
      <div className="rtab-empty">
        <p>No runs yet. Start your first test run above.</p>
      </div>
    );
  }

  return (
    <div className="rhistory-list">
      {runs.map((run) => {
        const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.canceled;
        const dur = duration(run);
        const isSelected = run.id === selectedRunId;
        return (
          <button
            key={run.id}
            className={`rhistory-item${isSelected ? " rhistory-item-active" : ""}`}
            onClick={() => onSelect(run)}
          >
            <span className={`pdetail-dot ${cfg.dotCls}`} aria-hidden="true" />
            <div className="rhistory-item-body">
              <div className="rhistory-item-top">
                <span className={`plist-badge ${cfg.badgeCls}`}>{cfg.label}</span>
                <span className="rhistory-scope">
                  {run.scope_mode === "everything" ? "Full scan" : "Custom"}
                </span>
              </div>
              <div className="rhistory-item-meta">
                {timeAgo(run.created_at)}
                {dur && <> · {dur}</>}
              </div>
            </div>
            <svg className="rhistory-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
