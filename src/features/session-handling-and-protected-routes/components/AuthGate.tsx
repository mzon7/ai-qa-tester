import type { ReactNode } from "react";
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Wraps the entire route tree. While the Supabase session is being resolved
 * (loading === true), renders a full-screen futuristic loading indicator so no
 * route — protected or public — flashes the wrong content.
 *
 * Once loading resolves, children render normally. Protected routes then handle
 * their own redirect logic (ProtectedRoute), but they will never hit their own
 * loading branch because AuthGate has already waited for the session.
 */
export default function AuthGate({ children }: AuthGateProps) {
  const { loading } = useAuth();

  if (!loading) return <>{children}</>;

  return (
    <div className="authgate-root" aria-busy="true" aria-label="Initializing session">
      {/* Scan-lines */}
      <div className="authgate-scanlines" aria-hidden="true" />

      {/* Ambient orbs */}
      <div className="authgate-orb authgate-orb-green" aria-hidden="true" />
      <div className="authgate-orb authgate-orb-purple" aria-hidden="true" />

      {/* Central radar scanner */}
      <div className="authgate-scanner" aria-hidden="true">
        <div className="authgate-ring authgate-ring-1" />
        <div className="authgate-ring authgate-ring-2" />
        <div className="authgate-ring authgate-ring-3" />
        <div className="authgate-sweep" />
        <div className="authgate-center-dot" />
      </div>

      {/* Status text */}
      <div className="authgate-status">
        <span className="authgate-label">INITIALIZING SESSION</span>
        <span className="authgate-dots">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
