import { useState, useEffect } from "react";
import type { Run } from "../../../lib/api";
import { useRunDetail } from "../lib/useRuns";
import RunHistoryList from "./RunHistoryList";
import RunStepsList from "./RunStepsList";
import RunLogsList from "./RunLogsList";

type Tab = "history" | "steps" | "logs";

interface RunTabsProps {
  runs: Run[];
  runsLoading: boolean;
  /** The run to show steps/logs for — defaults to the latest run. */
  activeRunId: string | null;
  onSelectRun: (run: Run) => void;
}

export default function RunTabs({ runs, runsLoading, activeRunId, onSelectRun }: RunTabsProps) {
  const [tab, setTab] = useState<Tab>("history");
  const { steps, logs, loading: detailLoading } = useRunDetail(
    (tab === "steps" || tab === "logs") ? activeRunId : null
  );

  // Switch to history tab when there are no runs yet
  useEffect(() => {
    if (runs.length === 0) setTab("history");
  }, [runs.length]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "history", label: "History" },
    { id: "steps",   label: "Steps"   },
    { id: "logs",    label: "Logs"    },
  ];

  return (
    <div className="rtabs-container">
      <div className="rtabs-bar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`rtabs-tab${tab === t.id ? " rtabs-tab-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rtabs-panel" role="tabpanel">
        {tab === "history" && (
          <RunHistoryList
            runs={runs}
            selectedRunId={activeRunId}
            onSelect={onSelectRun}
          />
        )}
        {tab === "steps" && (
          <RunStepsList steps={steps} loading={detailLoading} />
        )}
        {tab === "logs" && (
          <RunLogsList logs={logs} loading={detailLoading} autoScroll />
        )}
      </div>
    </div>
  );
}
