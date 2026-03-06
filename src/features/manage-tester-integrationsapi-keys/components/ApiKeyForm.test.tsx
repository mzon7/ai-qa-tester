/**
 * Component tests: ApiKeyForm — save key flow
 *
 * Mocks the api module directly so we can control settingsGet / settingsSaveKeys
 * without needing a live Supabase edge function.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../lib/api", () => ({
  settingsGet: vi.fn(),
  settingsSaveKeys: vi.fn(),
  settingsValidateKeys: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {},
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

import * as api from "../../../lib/api";
import ApiKeyForm from "./ApiKeyForm";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.settingsGet).mockResolvedValue({ data: null, error: null });
});

describe("ApiKeyForm — save key flow", () => {
  it("disables Save Key button when input is empty", async () => {
    render(<ApiKeyForm />);
    await waitFor(() => screen.getByRole("button", { name: /save key/i }));

    expect(screen.getByRole("button", { name: /save key/i })).toBeDisabled();
  });

  it("calls settingsSaveKeys with provider and key on form submit", async () => {
    vi.mocked(api.settingsSaveKeys).mockResolvedValue({
      data: { hint: "7890", provider: "grok" },
      error: null,
    });

    const user = userEvent.setup();
    render(<ApiKeyForm />);
    await waitFor(() => screen.getByRole("button", { name: /save key/i }));

    await user.type(screen.getByLabelText(/api key/i), "xai-test-key-7890");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    expect(api.settingsSaveKeys).toHaveBeenCalledWith("grok", "xai-test-key-7890");
  });

  it("shows Saved! confirmation after successful save", async () => {
    vi.mocked(api.settingsSaveKeys).mockResolvedValue({
      data: { hint: "7890", provider: "grok" },
      error: null,
    });

    const user = userEvent.setup();
    render(<ApiKeyForm />);
    await waitFor(() => screen.getByRole("button", { name: /save key/i }));

    await user.type(screen.getByLabelText(/api key/i), "xai-test-key-7890");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => expect(screen.getByText(/saved!/i)).toBeInTheDocument());
  });

  it("shows an error message when save fails", async () => {
    vi.mocked(api.settingsSaveKeys).mockResolvedValue({
      data: null,
      error: "Encryption service unavailable",
    });

    const user = userEvent.setup();
    render(<ApiKeyForm />);
    await waitFor(() => screen.getByRole("button", { name: /save key/i }));

    await user.type(screen.getByLabelText(/api key/i), "bad-key");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Encryption service unavailable")
    );
  });

  it("clears the input after a successful save", async () => {
    vi.mocked(api.settingsSaveKeys).mockResolvedValue({
      data: { hint: "abcd", provider: "grok" },
      error: null,
    });

    const user = userEvent.setup();
    render(<ApiKeyForm />);
    await waitFor(() => screen.getByRole("button", { name: /save key/i }));

    const input = screen.getByLabelText(/api key/i);
    await user.type(input, "xai-secret-abcd");
    await user.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  });
});
