import type { RunStep } from "../../../lib/api";

interface RunStepsListProps {
  steps: RunStep[];
  loading: boolean;
}

const STEP_STATUS: Record<string, { label: string; cls: string; dotCls: string }> = {
  pending:  { label: "Pending",  cls: "badge-idle",    dotCls: "dot-idle"    },
  running:  { label: "Running",  cls: "badge-running", dotCls: "dot-running" },
  passed:   { label: "Passed",   cls: "badge-passed",  dotCls: "dot-passed"  },
  failed:   { label: "Failed",   cls: "badge-failed",  dotCls: "dot-failed"  },
  skipped:  { label: "Skipped",  cls: "badge-idle",    dotCls: "dot-idle"    },
};

export default function RunStepsList({ steps, loading }: RunStepsListProps) {
  if (loading) {
    return <div className="rtab-empty"><span className="auth-spinner" /></div>;
  }

  if (steps.length === 0) {
    return (
      <div className="rtab-empty">
        <p>No steps yet. Steps appear once the run starts.</p>
      </div>
    );
  }

  return (
    <ol className="rsteps-list">
      {steps.map((step) => {
        const cfg = STEP_STATUS[step.status] ?? STEP_STATUS.pending;
        return (
          <li key={step.id} className={`rstep-item rstep-${step.status}`}>
            <div className="rstep-num">{step.idx + 1}</div>
            <div className="rstep-body">
              <div className="rstep-top">
                <span className="rstep-title">{step.title}</span>
                <span className={`plist-badge ${cfg.cls}`}>{cfg.label}</span>
              </div>
              {step.expected && (
                <p className="rstep-expected">Expected: {step.expected}</p>
              )}
              {step.notes && (
                <p className="rstep-notes">{step.notes}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
