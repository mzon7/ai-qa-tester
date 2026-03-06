import type { Run } from "../../../lib/api";

interface RunStatusPanelProps {
  run: Run;
  onRerun: () => void;
  rerunLoading: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; dotCls: string; badgeCls: string }> = {
  queued:   { label: "Queued",   dotCls: "dot-queued",  badgeCls: "badge-queued"  },
  running:  { label: "Running",  dotCls: "dot-running", badgeCls: "badge-running" },
  passed:   { label: "Passed",   dotCls: "dot-passed",  badgeCls: "badge-passed"  },
  failed:   { label: "Failed",   dotCls: "dot-failed",  badgeCls: "badge-failed"  },
  canceled: { label: "Canceled", dotCls: "dot-idle",    badgeCls: "badge-idle"    },
};

function duration(run: Run): string | null {
  if (!run.started_at) return null;
  const end = run.completed_at ? new Date(run.completed_at) : new Date();
  const ms = end.getTime() - new Date(run.started_at).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
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

export default function RunStatusPanel({ run, onRerun, rerunLoading }: RunStatusPanelProps) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.canceled;
  const dur = duration(run);
  const isActive = run.status === "queued" || run.status === "running";
  const isDone = run.status === "passed" || run.status === "failed" || run.status === "canceled";

  return (
    <div className="rsp-panel">
      <div className="rsp-top">
        <div className="rsp-status-row">
          <span className={`pdetail-dot ${cfg.dotCls}`} aria-hidden="true" />
          <span className={`plist-badge ${cfg.badgeCls}`}>{cfg.label}</span>
          <span className="rsp-meta">
            {timeAgo(run.created_at)}
            {dur && <> · {dur}</>}
            {run.scope_mode === "instructions" && <> · Custom</>}
          </span>
        </div>

        {isDone && (
          <button
            className="rsp-rerun-btn"
            onClick={onRerun}
            disabled={rerunLoading}
            aria-label="Re-run test"
          >
            {rerunLoading ? <span className="auth-spinner" /> : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M6 2l2-2M6 2l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            Re-run
          </button>
        )}
      </div>

      {isActive && (
        <div className="rsp-active-indicator">
          <span className="rsp-pulse-ring" aria-hidden="true" />
          <span className="rsp-active-label">
            {run.status === "queued" ? "Waiting to start…" : "Running tests…"}
          </span>
        </div>
      )}

      {run.summary && (
        <p className="rsp-summary">{run.summary}</p>
      )}

      {run.error && run.status === "failed" && (
        <div className="rsp-error-box" role="alert">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="6.5" y1="4" x2="6.5" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="6.5" cy="9" r="0.7" fill="currentColor" />
          </svg>
          {run.error}
        </div>
      )}

      {run.instructions && (
        <p className="rsp-instructions">
          <span className="rsp-instructions-label">Instructions:</span> {run.instructions}
        </p>
      )}
    </div>
  );
}
