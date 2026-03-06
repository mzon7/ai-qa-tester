import type { Run, RunStep } from "../../../lib/api";
import { countStepsByStatus, formatScanSummary, isButtonScanStep } from "../lib/buttonScanUtils";

interface ButtonScanPanelProps {
  run: Run | null;
  steps: RunStep[];
  onTriggerScan: () => void;
  scanLoading: boolean;
}

const STATUS_ICON = {
  passed: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 7l1.8 1.8 3.2-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  failed: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="4.5" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
    </svg>
  ),
};

function ScanStatusDot({ status }: { status: Run["status"] }) {
  if (status === "running") {
    return <span className="bsp-pulse-dot" aria-hidden="true" />;
  }
  if (status === "passed") {
    return <span className="bsp-dot bsp-dot-passed" aria-hidden="true" />;
  }
  if (status === "failed") {
    return <span className="bsp-dot bsp-dot-failed" aria-hidden="true" />;
  }
  return <span className="bsp-dot bsp-dot-idle" aria-hidden="true" />;
}

export default function ButtonScanPanel({ run, steps, onTriggerScan, scanLoading }: ButtonScanPanelProps) {
  // Only show for "everything" scope runs
  if (run && run.scope_mode !== "everything") return null;

  // Filter to button-scan steps only
  const bsSteps = steps.filter((s) => isButtonScanStep(s.title));
  const counts = countStepsByStatus(bsSteps);
  const summary = formatScanSummary(counts);

  const isQueued = run?.status === "queued";
  const isRunning = run?.status === "running" || scanLoading;
  const isDone = run?.status === "passed" || run?.status === "failed";

  return (
    <div className="bsp-panel" aria-label="Button scan">
      {/* Header */}
      <div className="bsp-header">
        <div className="bsp-header-left">
          {/* Radar icon */}
          <svg className="bsp-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
            <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <line x1="8" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
          </svg>
          <span className="bsp-title">Button Scan</span>
          {run && <ScanStatusDot status={run.status} />}
        </div>

        {/* Trigger button — only when run is queued and not already scanning */}
        {isQueued && !scanLoading && (
          <button
            className="bsp-trigger-btn"
            onClick={onTriggerScan}
            aria-label="Trigger button scan"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <polygon points="2,1.5 9.5,5.5 2,9.5" fill="currentColor" />
            </svg>
            Run Scan
          </button>
        )}
      </div>

      {/* Body */}
      {isRunning && (
        <div className="bsp-running">
          <span className="bsp-spinner" aria-hidden="true" />
          <span className="bsp-running-label">
            Scanning interactive elements…
          </span>
        </div>
      )}

      {isDone && bsSteps.length > 0 && (
        <div className="bsp-results">
          <p className="bsp-summary-line">{summary}</p>
          <div className="bsp-groups">
            {bsSteps.map((step) => (
              <div key={step.id} className={`bsp-group bsp-group-${step.status}`}>
                <span className={`bsp-group-icon bsp-group-icon-${step.status}`}>
                  {step.status === "passed" ? STATUS_ICON.passed : STATUS_ICON.failed}
                </span>
                <div className="bsp-group-info">
                  <span className="bsp-group-title">{step.title}</span>
                  {step.notes && (
                    <span className="bsp-group-notes">{step.notes}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDone && bsSteps.length === 0 && (
        <p className="bsp-empty">
          {run?.summary ?? "Button scan complete. View Steps tab for details."}
        </p>
      )}

      {isQueued && !scanLoading && (
        <p className="bsp-hint">
          Click <strong>Run Scan</strong> to test all buttons, links, and form inputs on the target page.
          Destructive actions are automatically skipped.
        </p>
      )}
    </div>
  );
}
