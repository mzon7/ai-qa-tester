import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, AuthCallback } from "@mzon7/zon-incubator-sdk/auth";
import { supabase } from "./lib/supabase";
import AuthGate from "./features/session-handling-and-protected-routes/components/AuthGate";
import { useAuthStateListener } from "./features/session-handling-and-protected-routes/lib/useAuthStateListener";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";

function AppRoutes() {
  // Clears sensitive localStorage keys when user signs out
  useAuthStateListener();

  return (
    <Routes>
      {/* Public / auth routes — redirect to /home if already logged in */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/auth/callback"
        element={<AuthCallback supabase={supabase} redirectTo="/home" />}
      />

      {/* Protected routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />

      {/* Settings — protected */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Projects — protected; full page to be built in a later feature */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Navigate to="/home" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/*"
        element={
          <ProtectedRoute>
            <Navigate to="/projects" replace />
          </ProtectedRoute>
        }
      />

      {/* Default */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

/**
 * AuthGate wraps AppRoutes so the entire route tree waits for the Supabase
 * session to resolve before rendering — preventing auth-state flicker on load.
 */
export default function App() {
  return (
    <AuthGate>
      <AppRoutes />
    </AuthGate>
  );
}
