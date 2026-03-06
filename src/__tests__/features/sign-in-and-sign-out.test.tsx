/**
 * Tests: Sign in and Sign out
 *
 * Covers:
 *  1. Sign in with valid credentials → authenticated + redirected to /home
 *  2. Sign in with invalid credentials → stays on login, shows error, no redirect
 *  3. Sign out from authenticated session → signOut called; auth guard redirects unauthenticated users
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { AuthContextValue } from "@mzon7/zon-incubator-sdk/auth";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@mzon7/zon-incubator-sdk/auth", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
  AuthCallback: () => null,
  AuthContext: null,
}));

// Import AFTER mocks are registered
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";
import SignInForm from "../../features/sign-in-and-sign-out/components/SignInForm";
import TopNav from "../../features/sign-in-and-sign-out/components/TopNav";
import RedirectIfAuthenticated from "../../features/sign-in-and-sign-out/components/RedirectIfAuthenticated";

const mockUseAuth = vi.mocked(useAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a complete AuthContextValue with sensible defaults.
 * Any field can be overridden via the partial argument.
 */
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
  };
}

/**
 * Render a component inside a MemoryRouter (required for Link / useLocation).
 */
function renderWithRouter(ui: ReactNode, { initialRoute = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
  );
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Fill and submit the sign-in form, wrapped in act to flush async state updates. */
async function submitSignInForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  });
}

// ─── Reset between tests ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("Sign in with valid credentials", () => {
  it("authenticates the user and navigates to /home", async () => {
    const auth = createMockAuth({
      signIn: vi.fn().mockResolvedValue({ error: null }),
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<SignInForm />, { initialRoute: "/login" });

    await submitSignInForm("user@example.com", "validpassword");

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith("user@example.com", "validpassword");
      expect(mockNavigate).toHaveBeenCalledWith("/home", { replace: true });
    });
  });

  it("does not display an error message on successful sign in", async () => {
    const auth = createMockAuth({
      signIn: vi.fn().mockResolvedValue({ error: null }),
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<SignInForm />);

    await submitSignInForm("user@example.com", "validpassword");

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

describe("Sign in with invalid credentials", () => {
  it("shows an error message and does not navigate away", async () => {
    const auth = createMockAuth({
      signIn: vi.fn().mockResolvedValue({ error: "Invalid login credentials" }),
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<SignInForm />, { initialRoute: "/login" });

    await submitSignInForm("user@example.com", "wrongpassword");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid login credentials");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("keeps the login form visible after failure", async () => {
    const auth = createMockAuth({
      signIn: vi.fn().mockResolvedValue({ error: "Invalid login credentials" }),
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<SignInForm />);

    await submitSignInForm("user@example.com", "wrongpassword");

    await waitFor(() => {
      // Form fields and submit button still present
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
  });
});

describe("Sign out from an authenticated session", () => {
  it("calls signOut when the sign-out button is clicked", async () => {
    const auth = createMockAuth({
      user: { id: "abc123", email: "test@example.com" } as AuthContextValue["user"],
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<TopNav />, { initialRoute: "/home" });

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });
  });

  it("renders the user email in the nav when authenticated", () => {
    const auth = createMockAuth({
      user: { id: "abc123", email: "test@example.com" } as AuthContextValue["user"],
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(<TopNav />, { initialRoute: "/home" });

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("redirects authenticated users away from auth pages (RedirectIfAuthenticated)", () => {
    const auth = createMockAuth({
      user: { id: "abc123", email: "test@example.com" } as AuthContextValue["user"],
      loading: false,
    });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(
      <RedirectIfAuthenticated>
        <div data-testid="auth-page">Login form</div>
      </RedirectIfAuthenticated>,
      { initialRoute: "/login" }
    );

    // The auth page content should not be rendered — user is redirected
    expect(screen.queryByTestId("auth-page")).not.toBeInTheDocument();
  });

  it("shows auth page content for unauthenticated users", () => {
    const auth = createMockAuth({ user: null, loading: false });
    mockUseAuth.mockReturnValue(auth);

    renderWithRouter(
      <RedirectIfAuthenticated>
        <div data-testid="auth-page">Login form</div>
      </RedirectIfAuthenticated>
    );

    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
  });
});
