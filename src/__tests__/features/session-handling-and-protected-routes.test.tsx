/**
 * Tests: Session Handling and Protected Routes
 *
 * Covers:
 *  1. Access a protected page while unauthenticated → redirected to Login, no protected content shown
 *  2. Refresh while authenticated → session restored, protected content rendered without re-login
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { AuthContextValue } from "@mzon7/zon-incubator-sdk/auth";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Only mock the auth module — react-router-dom is used as-is (MemoryRouter drives routing)
vi.mock("@mzon7/zon-incubator-sdk/auth", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  // ProtectedRoute: passthrough — we use TestProtectedRoute in tests below
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
  AuthCallback: () => null,
  AuthContext: null,
}));

import { useAuth } from "@mzon7/zon-incubator-sdk/auth";
import AuthGate from "../../features/session-handling-and-protected-routes/components/AuthGate";
import RedirectIfAuthenticated from "../../features/sign-in-and-sign-out/components/RedirectIfAuthenticated";

const mockUseAuth = vi.mocked(useAuth);

// ─── TestProtectedRoute ───────────────────────────────────────────────────────
//
// Local mirror of the SDK's ProtectedRoute. Uses the already-mocked useAuth,
// so each test can control auth state via mockUseAuth.mockReturnValue(…).
//
function TestProtectedRoute({
  children,
  loginPath = "/login",
}: {
  children: ReactNode;
  loginPath?: string;
}) {
  const { user, loading } = mockUseAuth();
  if (loading) return <div data-testid="auth-loading">Loading…</div>;
  if (!user) return <Navigate to={loginPath} replace />;
  return <>{children}</>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(email = "user@example.com"): AuthContextValue["user"] {
  return { id: "user-1", email } as AuthContextValue["user"];
}

function createMockAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    session: null,
    loading: false,
    registered: false,
    registrationError: null,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null, needsConfirmation: false }),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthContextValue;
}

/** Renders a minimal guarded app and starts at initialRoute. */
function renderApp(initialRoute: string, auth: AuthContextValue) {
  mockUseAuth.mockReturnValue(auth);

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthGate>
        <Routes>
          <Route
            path="/login"
            element={<div data-testid="login-page">Login Page</div>}
          />
          <Route
            path="/home"
            element={
              <TestProtectedRoute>
                <div data-testid="home-page">Home Page</div>
              </TestProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <TestProtectedRoute>
                <div data-testid="projects-page">Projects Page</div>
              </TestProtectedRoute>
            }
          />
        </Routes>
      </AuthGate>
    </MemoryRouter>
  );
}

// ─── Reset between tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test cases ───────────────────────────────────────────────────────────────

describe("Access a protected page while unauthenticated", () => {
  it("redirects to /login when navigating to /home without a session", () => {
    renderApp("/home", createMockAuth({ user: null, loading: false }));

    expect(screen.queryByTestId("home-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("redirects to /login when navigating to /projects without a session", () => {
    renderApp("/projects", createMockAuth({ user: null, loading: false }));

    expect(screen.queryByTestId("projects-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("shows the AuthGate loading screen while the session is being resolved", () => {
    renderApp("/home", createMockAuth({ user: null, loading: true }));

    // AuthGate blocks all routes during loading — neither protected nor login page flashes
    expect(screen.queryByTestId("home-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Initializing session")).toBeInTheDocument();
  });
});

describe("Refresh the browser while authenticated (session persistence)", () => {
  it("renders protected content when the session is already active on mount", () => {
    // Simulates a page refresh: Supabase has already resolved the session
    // before the first render, so loading goes straight to false with a user.
    renderApp("/home", createMockAuth({ user: makeUser(), loading: false }));

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("never flashes the login page when loading transitions to an authenticated user", () => {
    // Phase 1: loading=true — AuthGate shows spinner, nothing else renders
    const auth = createMockAuth({ user: makeUser(), loading: true });
    mockUseAuth.mockReturnValue(auth);

    const { rerender } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <AuthGate>
          <Routes>
            <Route
              path="/login"
              element={<div data-testid="login-page">Login Page</div>}
            />
            <Route
              path="/home"
              element={
                <TestProtectedRoute>
                  <div data-testid="home-page">Home Page</div>
                </TestProtectedRoute>
              }
            />
          </Routes>
        </AuthGate>
      </MemoryRouter>
    );

    // During load: no flicker of any page content
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-page")).not.toBeInTheDocument();

    // Phase 2: session resolved with authenticated user
    mockUseAuth.mockReturnValue(createMockAuth({ user: makeUser(), loading: false }));

    rerender(
      <MemoryRouter initialEntries={["/home"]}>
        <AuthGate>
          <Routes>
            <Route
              path="/login"
              element={<div data-testid="login-page">Login Page</div>}
            />
            <Route
              path="/home"
              element={
                <TestProtectedRoute>
                  <div data-testid="home-page">Home Page</div>
                </TestProtectedRoute>
              }
            />
          </Routes>
        </AuthGate>
      </MemoryRouter>
    );

    // After loading: home page shown, login page never appeared
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("auth pages redirect to /home when an active session exists (RedirectIfAuthenticated)", () => {
    mockUseAuth.mockReturnValue(createMockAuth({ user: makeUser(), loading: false }));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <div data-testid="login-page">Login Page</div>
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/home"
            element={<div data-testid="home-page">Home Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // Authenticated user visiting /login is bounced to /home
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });
});
