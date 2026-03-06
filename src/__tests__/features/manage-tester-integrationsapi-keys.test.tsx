/**
 * Tests: Manage Tester Integrations / API Keys
 *
 * Covers:
 *  1. Save valid API key and validate configuration → key stored, validation passes, UI shows success
 *  2. Save invalid API key → validation fails with actionable error message, no success state shown
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock the api module — ApiKeyForm imports settingsGet/settingsSaveKeys/settingsValidateKeys from here
vi.mock("../../lib/api", () => ({
  settingsGet: vi.fn(),
  settingsSaveKeys: vi.fn(),
  settingsValidateKeys: vi.fn(),
}));

// Mock auth (ApiKeyForm doesn't use it directly, but AppLayout→TopNav does via useAuth)
vi.mock("@mzon7/zon-incubator-sdk/auth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1", email: "tester@example.com" },
    session: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  })),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
  AuthCallback: () => null,
  AuthContext: null,
}));

// react-router-dom: keep real, but stub useLocation for TopNav
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/settings" }),
    Link: ({ children, ...props }: { children: ReactNode; to: string; [k: string]: unknown }) => (
      <a href={String(props.to)}>{children}</a>
    ),
  };
});

import { settingsGet, settingsSaveKeys, settingsValidateKeys } from "../../lib/api";
import ApiKeyForm from "../../features/manage-tester-integrationsapi-keys/components/ApiKeyForm";

const mockSettingsGet = vi.mocked(settingsGet);
const mockSettingsSaveKeys = vi.mocked(settingsSaveKeys);
const mockSettingsValidateKeys = vi.mocked(settingsValidateKeys);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Render ApiKeyForm and wait for the initial settingsGet to resolve. */
async function renderForm() {
  const view = render(<ApiKeyForm />);
  // Wait for the loading spinner to disappear (settingsGet resolved)
  await waitFor(() => {
    expect(screen.queryByText(/loading settings/i)).not.toBeInTheDocument();
  });
  return view;
}

/** Type a key into the API key input and click Save. */
async function saveKey(key: string) {
  fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: key } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));
  });
}

// ─── Before each ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing settings saved
  mockSettingsGet.mockResolvedValue({ data: null, error: null });
});

// ─── Test cases ───────────────────────────────────────────────────────────────

describe("Save valid API key and validate configuration", () => {
  it("shows Saved! feedback after a successful save", async () => {
    mockSettingsSaveKeys.mockResolvedValue({
      data: { hint: "1234", provider: "grok" },
      error: null,
    });

    await renderForm();
    await saveKey("xai-valid-key-1234");

    await waitFor(() => {
      expect(screen.getByText(/saved!/i)).toBeInTheDocument();
    });
    expect(mockSettingsSaveKeys).toHaveBeenCalledWith("grok", "xai-valid-key-1234");
  });

  it("displays the key hint (last 4 chars) after a successful save", async () => {
    mockSettingsSaveKeys.mockResolvedValue({
      data: { hint: "1234", provider: "grok" },
      error: null,
    });

    await renderForm();
    await saveKey("xai-valid-key-1234");

    await waitFor(() => {
      expect(screen.getByText(/1234/)).toBeInTheDocument();
    });
  });

  it("shows a validation success message when key is valid", async () => {
    // Pre-load settings so "Key set" indicator appears and Validate is enabled
    mockSettingsGet.mockResolvedValue({
      data: {
        provider: "grok",
        key_hint: "abcd",
        key_set: true,
        memory_retention_days: 30,
        updated_at: "2026-03-06T00:00:00Z",
      },
      error: null,
    });
    mockSettingsValidateKeys.mockResolvedValue({
      data: { valid: true, message: "Grok API key is valid" },
      error: null,
    });

    await renderForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /validate key/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Grok API key is valid");
    });
    expect(mockSettingsValidateKeys).toHaveBeenCalledTimes(1);
  });

  it("calls settingsSaveKeys with the correct provider and trimmed key", async () => {
    mockSettingsSaveKeys.mockResolvedValue({
      data: { hint: "xyz9", provider: "openai" },
      error: null,
    });

    await renderForm();

    // Switch to OpenAI provider
    fireEvent.click(screen.getByText(/openai/i));

    await saveKey("  sk-test-key-xyz9  "); // with surrounding whitespace

    expect(mockSettingsSaveKeys).toHaveBeenCalledWith("openai", "sk-test-key-xyz9");
  });
});

describe("Save invalid API key — validation fails with actionable error", () => {
  it("shows an error alert when save itself fails", async () => {
    mockSettingsSaveKeys.mockResolvedValue({
      data: null,
      error: "provider and api_key are required",
    });

    await renderForm();
    await saveKey("bad");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("provider and api_key are required");
    });
  });

  it("shows a validation error when the stored key fails provider auth check", async () => {
    mockSettingsGet.mockResolvedValue({
      data: {
        provider: "grok",
        key_hint: "dead",
        key_set: true,
        memory_retention_days: 30,
        updated_at: "2026-03-06T00:00:00Z",
      },
      error: null,
    });
    mockSettingsValidateKeys.mockResolvedValue({
      data: { valid: false, message: "Invalid API key — authentication failed" },
      error: null,
    });

    await renderForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /validate key/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("authentication failed");
    });
    // No success indicator should appear
    expect(screen.queryByText(/valid$/i)).not.toBeInTheDocument();
  });

  it("shows an error when the validate edge function itself errors (e.g., rate limit)", async () => {
    mockSettingsGet.mockResolvedValue({
      data: {
        provider: "grok",
        key_hint: "abcd",
        key_set: true,
        memory_retention_days: 30,
        updated_at: "2026-03-06T00:00:00Z",
      },
      error: null,
    });
    mockSettingsValidateKeys.mockResolvedValue({
      data: null,
      error: "Rate limit exceeded. Try again in 1 minute.",
    });

    await renderForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /validate key/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Rate limit exceeded");
    });
  });

  it("disables the Validate button when no key has been saved yet", async () => {
    // No settings — key_set=false
    mockSettingsGet.mockResolvedValue({ data: null, error: null });

    await renderForm();

    expect(screen.getByRole("button", { name: /validate key/i })).toBeDisabled();
  });

  it("clears the API key input after a successful save (preventing accidental re-display)", async () => {
    mockSettingsSaveKeys.mockResolvedValue({
      data: { hint: "5678", provider: "grok" },
      error: null,
    });

    await renderForm();
    await saveKey("xai-secret-key-5678");

    await waitFor(() => {
      // Input should be cleared after save — key no longer visible
      const input = screen.getByLabelText(/api key/i) as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });
});
