import { useRef, useEffect } from "react";
import type { Run } from "../../../lib/api";
import { useRunSSE } from "../../../lib/sse";

interface RunStatusPanelProps {
  run: Run;
  onRerun: () => void;
  rerunLoading: boolean;
}

const MAX_VISIBLE_LOGS = 100;

const LEVEL_CLS: Record<string, string> = {
  info: "rlog-info",
  warn: "rlog-warn",
  error: "rlog-error",
};

function fmtLogTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

/** True when a queued run is blocked pending user clarification of the description. */
function isNeedsInput(run: Run): boolean {
  return run.status === "queued" && (
    (run.summary?.startsWith("needs_input:") ?? false) ||
    (run.error?.startsWith("needs_input:") ?? false)
  );
}

/** Strip the "needs_input: " prefix for display. */
function needsInputMessage(run: Run): string {
  const raw = run.summary?.startsWith("needs_input:")
    ? run.summary
    : run.error ?? "";
  return raw.replace(/^needs_input:\s*/i, "");
}

export default function RunStatusPanel({ run, onRerun, rerunLoading }: RunStatusPanelProps) {
  const isActive = run.status === "queued" || run.status === "running";

  // Subscribe to live SSE only while the run is active
  const { sseStatus, sseLogs, sseConnected } = useRunSSE(isActive ? run.id : null);

  // Merge SSE status with the prop: SSE is more current when connected
  const liveStatus = (sseConnected && sseStatus?.status) ? sseStatus.status : run.status;

  const cfg = STATUS_CONFIG[liveStatus] ?? STATUS_CONFIG.canceled;
  const dur = duration(run);
  const needsInput = isNeedsInput(run);
  // Suppress the "Waiting to start…" pulse when we're actually blocked on input
  const isActiveDisplay = !needsInput && isActive;
  const isDone = liveStatus === "passed" || liveStatus === "failed" || liveStatus === "canceled";
  // Don't show the plain summary when it's a needs_input message (shown separately below)
  const plainSummary = !needsInput && run.summary ? run.summary : null;

  // Virtualized log list: only render last MAX_VISIBLE_LOGS entries
  const visibleLogs = sseLogs.length > MAX_VISIBLE_LOGS
    ? sseLogs.slice(-MAX_VISIBLE_LOGS)
    : sseLogs;

  // Auto-scroll to bottom when new logs arrive
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sseLogs.length > 0 && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [sseLogs.length]);

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

      {isActiveDisplay && (
        <div className="rsp-active-indicator">
          <span className="rsp-pulse-ring" aria-hidden="true" />
          <span className="rsp-active-label">
            {run.status === "queued" ? "Waiting to start…" : "Running tests…"}
          </span>
        </div>
      )}

      {/* Live log stream — visible while run is active and logs are arriving */}
      {isActive && sseLogs.length > 0 && (
        <div className="rsp-live-logs">
          <div className="rsp-live-logs-header">
            <span className="rsp-live-logs-title">Live Logs</span>
            {sseConnected && <span className="rsp-live-dot" aria-label="Connected" />}
            <span className="rsp-live-logs-count">{sseLogs.length} lines</span>
          </div>
          <div className="rsp-live-logs-list" role="log" aria-live="polite" aria-label="Live run logs">
            {visibleLogs.map((log) => (
              <div key={log.id} className={`rlog-line ${LEVEL_CLS[log.level] ?? "rlog-info"}`}>
                <span className="rlog-time">{fmtLogTime(log.ts)}</span>
                <span className="rlog-level">{log.level.toUpperCase()}</span>
                <span className="rlog-msg">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* needs_input: clarification required — shown instead of the pulse animation */}
      {needsInput && (
        <div className="rsp-error-box rsp-needs-input" role="alert">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="6.5" y1="3.5" x2="6.5" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="6.5" cy="9" r="0.7" fill="currentColor" />
          </svg>
          <span>
            <strong>More detail needed:</strong> {needsInputMessage(run)}
          </span>
        </div>
      )}

      {plainSummary && (
        <p className="rsp-summary">{plainSummary}</p>
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
