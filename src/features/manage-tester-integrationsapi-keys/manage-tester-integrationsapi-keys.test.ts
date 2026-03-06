/**
 * Tests: Manage Tester Integrations / API Keys
 *
 * Unit tests for the settings feature logic and API wrappers.
 * Component rendering tests (ApiKeyForm) are in src/__tests__/features/.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock SDK ─────────────────────────────────────────────────────────────────

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {},
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

import { callEdgeFunction } from "@mzon7/zon-incubator-sdk";
import { settingsSaveKeys, settingsGet, settingsValidateKeys } from "../../lib/api";

const mockCall = vi.mocked(callEdgeFunction);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── API wrapper tests ────────────────────────────────────────────────────────

describe("settingsSaveKeys", () => {
  it("calls the settings_save_keys edge function with provider and api_key", async () => {
    mockCall.mockResolvedValueOnce({ data: { hint: "1234", provider: "grok" }, error: null });

    const result = await settingsSaveKeys("grok", "xai-test-key-1234");

    expect(mockCall).toHaveBeenCalledWith(
      expect.anything(),
      "settings_save_keys",
      { provider: "grok", api_key: "xai-test-key-1234" }
    );
    expect(result.data).toEqual({ hint: "1234", provider: "grok" });
    expect(result.error).toBeNull();
  });

  it("returns error when the edge function fails", async () => {
    mockCall.mockResolvedValueOnce({ data: null, error: "Invalid provider" });

    const result = await settingsSaveKeys("bad-provider", "key");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Invalid provider");
  });
});

describe("settingsGet", () => {
  it("calls the settings_get edge function", async () => {
    const mockSettings = {
      provider: "grok",
      key_hint: "abcd",
      key_set: true,
      memory_retention_days: 30,
      updated_at: "2026-03-06T00:00:00Z",
    };
    mockCall.mockResolvedValueOnce({ data: mockSettings, error: null });

    const result = await settingsGet();

    expect(mockCall).toHaveBeenCalledWith(
      expect.anything(),
      "settings_get",
      {}
    );
    expect(result.data).toEqual(mockSettings);
    expect(result.error).toBeNull();
  });

  it("returns null data when no settings are saved yet", async () => {
    mockCall.mockResolvedValueOnce({ data: null, error: null });

    const result = await settingsGet();

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

describe("settingsValidateKeys", () => {
  it("calls the settings_validate_keys edge function", async () => {
    mockCall.mockResolvedValueOnce({
      data: { valid: true, message: "Grok API key is valid" },
      error: null,
    });

    const result = await settingsValidateKeys();

    expect(mockCall).toHaveBeenCalledWith(
      expect.anything(),
      "settings_validate_keys",
      {}
    );
    expect(result.data?.valid).toBe(true);
    expect(result.data?.message).toBe("Grok API key is valid");
  });

  it("returns valid=false with message when key is invalid", async () => {
    mockCall.mockResolvedValueOnce({
      data: { valid: false, message: "Invalid API key — authentication failed" },
      error: null,
    });

    const result = await settingsValidateKeys();

    expect(result.data?.valid).toBe(false);
    expect(result.data?.message).toContain("authentication failed");
  });

  it("propagates network/rate-limit errors", async () => {
    mockCall.mockResolvedValueOnce({
      data: null,
      error: "Rate limit exceeded. Try again in 1 minute.",
    });

    const result = await settingsValidateKeys();

    expect(result.data).toBeNull();
    expect(result.error).toContain("Rate limit exceeded");
  });
});

// ─── Key masking logic ────────────────────────────────────────────────────────

describe("API key hint/masking", () => {
  it("hint is always the last 4 characters of the key", () => {
    const keys = [
      { key: "xai-abc123def456", hint: "f456" },
      { key: "sk-proj-longopenaikey1234", hint: "1234" },
      { key: "testkey", hint: "tkey" },
    ];
    keys.forEach(({ key, hint }) => {
      expect(key.slice(-4)).toBe(hint);
    });
  });

  it("masked display format shows only the hint", () => {
    const hint = "abcd";
    const masked = `••••${hint}`;
    expect(masked).toBe("••••abcd");
    expect(masked).not.toContain("key");
  });
});

// ─── Provider validation ──────────────────────────────────────────────────────

describe("Provider selection", () => {
  const VALID_PROVIDERS = ["grok", "openai"];

  it("accepts grok as a valid provider", () => {
    expect(VALID_PROVIDERS.includes("grok")).toBe(true);
  });

  it("accepts openai as a valid provider", () => {
    expect(VALID_PROVIDERS.includes("openai")).toBe(true);
  });

  it("rejects unknown providers", () => {
    expect(VALID_PROVIDERS.includes("anthropic")).toBe(false);
    expect(VALID_PROVIDERS.includes("")).toBe(false);
  });
});
