import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";

interface Props {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Wraps auth pages (login/signup). If the user is already authenticated,
 * redirects them to the app instead of showing the auth form again.
 */
export default function RedirectIfAuthenticated({ children, redirectTo = "/home" }: Props) {
  const { user, loading } = useAuth();

  // While the session is being resolved, render nothing to avoid flash
  if (loading) return null;

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
