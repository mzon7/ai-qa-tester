import { useRef, useEffect } from "react";
import type { RunLog } from "../../../lib/api";

interface RunLogsListProps {
  logs: RunLog[];
  loading: boolean;
  autoScroll?: boolean;
}

const LEVEL_CLS: Record<string, string> = {
  info:  "rlog-info",
  warn:  "rlog-warn",
  error: "rlog-error",
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function RunLogsList({ logs, loading, autoScroll = true }: RunLogsListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, autoScroll]);

  if (loading) {
    return <div className="rtab-empty"><span className="auth-spinner" /></div>;
  }

  if (logs.length === 0) {
    return (
      <div className="rtab-empty">
        <p>No logs yet. Logs appear once the run starts.</p>
      </div>
    );
  }

  return (
    <div className="rlogs-container">
      {logs.map((log) => (
        <div key={log.id} className={`rlog-line ${LEVEL_CLS[log.level] ?? "rlog-info"}`}>
          <span className="rlog-time">{fmtTime(log.ts)}</span>
          <span className="rlog-level">{log.level.toUpperCase()}</span>
          <span className="rlog-msg">{log.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
