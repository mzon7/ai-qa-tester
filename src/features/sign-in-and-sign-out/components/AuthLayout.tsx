import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      {/* Scan-line overlay */}
      <div className="auth-scanlines" aria-hidden="true" />

      {/* Ambient glow orbs */}
      <div className="auth-orb auth-orb-green" aria-hidden="true" />
      <div className="auth-orb auth-orb-purple" aria-hidden="true" />

      {/* Header branding */}
      <div className="auth-brand">
        <div className="auth-brand-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <circle cx="14" cy="14" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            <circle cx="14" cy="14" r="2.5" fill="currentColor" />
            <line x1="14" y1="2" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="14" y1="22" x2="14" y2="26" stroke="currentColor" strokeWidth="1.5" />
            <line x1="2" y1="14" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5" />
            <line x1="22" y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <span className="auth-brand-name">QA<span className="auth-brand-accent">tester</span></span>
        <span className="auth-brand-tag">AI-POWERED</span>
      </div>

      {/* Card */}
      <div className="auth-card">
        {children}
      </div>

      {/* Footer */}
      <p className="auth-footer">
        Autonomous testing infrastructure &mdash; secured by Supabase
      </p>
    </div>
  );
}
