import type { ReactNode } from "react";
import TopNav from "../../sign-in-and-sign-out/components/TopNav";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Shared layout for all authenticated pages.
 * Provides the sticky TopNav + a full-height content area.
 * Pages rendered inside ProtectedRoute should use this instead of
 * importing TopNav directly.
 */
export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <TopNav />
      <main className="app-main">{children}</main>
    </div>
  );
}
