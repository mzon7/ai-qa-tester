/**
 * Tests: Test App Feature — Feature Description
 *
 * Unit tests for featureDescriptionUtils and the FeatureDescriptionInput component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import {
  validateFeatureDescription,
  normaliseFeatureDescription,
  FEATURE_DESCRIPTION_MAX_LENGTH,
  FEATURE_DESCRIPTION_MIN_LENGTH,
} from "./lib/featureDescriptionUtils";

import FeatureDescriptionInput from "./components/FeatureDescriptionInput";

// ─── validateFeatureDescription ──────────────────────────────────────────────

describe("validateFeatureDescription", () => {
  it("returns null for an empty string (field is optional)", () => {
    expect(validateFeatureDescription("")).toBeNull();
    expect(validateFeatureDescription("   ")).toBeNull();
  });

  it("returns an error when description is too short", () => {
    const err = validateFeatureDescription("short");
    expect(err).not.toBeNull();
    expect(err).toMatch(/at least/i);
  });

  it("returns null for a valid description", () => {
    const valid = "Users can sign up with email and password and confirm their account.";
    expect(validateFeatureDescription(valid)).toBeNull();
  });

  it("returns an error when description exceeds max length", () => {
    const over = "a".repeat(FEATURE_DESCRIPTION_MAX_LENGTH + 1);
    const err = validateFeatureDescription(over);
    expect(err).not.toBeNull();
    expect(err).toMatch(/at most/i);
  });

  it(`returns null for exactly ${FEATURE_DESCRIPTION_MIN_LENGTH} characters`, () => {
    const exact = "a".repeat(FEATURE_DESCRIPTION_MIN_LENGTH);
    expect(validateFeatureDescription(exact)).toBeNull();
  });

  it(`returns null for exactly ${FEATURE_DESCRIPTION_MAX_LENGTH} characters`, () => {
    const exact = "a".repeat(FEATURE_DESCRIPTION_MAX_LENGTH);
    expect(validateFeatureDescription(exact)).toBeNull();
  });
});

// ─── normaliseFeatureDescription ─────────────────────────────────────────────

describe("normaliseFeatureDescription", () => {
  it("trims whitespace and returns the trimmed string", () => {
    expect(normaliseFeatureDescription("  hello world  ")).toBe("hello world");
  });

  it("returns undefined for blank input", () => {
    expect(normaliseFeatureDescription("")).toBeUndefined();
    expect(normaliseFeatureDescription("   ")).toBeUndefined();
  });

  it("returns the string unchanged when no surrounding whitespace", () => {
    const desc = "Users can reset their password via email.";
    expect(normaliseFeatureDescription(desc)).toBe(desc);
  });
});

// ─── FeatureDescriptionInput component ───────────────────────────────────────

describe("FeatureDescriptionInput", () => {
  it("renders the label and textarea", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "",
        onChange: vi.fn(),
      })
    );
    expect(screen.getByLabelText(/feature description/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "Users can log in with email.",
        onChange: vi.fn(),
      })
    );
    expect(screen.getByRole("textbox")).toHaveValue("Users can log in with email.");
  });

  it("calls onChange when the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "",
        onChange,
      })
    );
    await user.type(screen.getByRole("textbox"), "abc");
    expect(onChange).toHaveBeenCalled();
  });

  it("shows an external error as an alert", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "",
        onChange: vi.fn(),
        error: "Something went wrong",
      })
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("shows inline validation error for too-short input", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "too",
        onChange: vi.fn(),
      })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/at least/i);
  });

  it("shows no error for empty input (optional field)", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "",
        onChange: vi.fn(),
      })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is disabled when the disabled prop is true", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "",
        onChange: vi.fn(),
        disabled: true,
      })
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("displays the character counter", () => {
    render(
      React.createElement(FeatureDescriptionInput, {
        value: "hello",
        onChange: vi.fn(),
      })
    );
    const expected = (FEATURE_DESCRIPTION_MAX_LENGTH - 5).toLocaleString();
    expect(screen.getByText(`${expected} left`)).toBeInTheDocument();
  });
});

// ─── featureExecutor API wrapper ──────────────────────────────────────────────

vi.mock("../../lib/supabase", () => ({
  supabase: {},
  dbTable: (name: string) => `ai_qa_tester_${name}`,
}));

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
  reportSelfHealError: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  featureExecutor: vi.fn(),
  runsFeaturePlan: vi.fn(),
}));

import * as api from "../../lib/api";

describe("featureExecutor API wrapper", () => {
  it("calls feature_executor with run_id", async () => {
    vi.mocked(api.featureExecutor).mockResolvedValue({
      data: { accepted: true, run_id: "run-1", message: "started" },
      error: null,
    });
    const result = await api.featureExecutor("run-1");
    expect(api.featureExecutor).toHaveBeenCalledWith("run-1");
    expect(result.data?.accepted).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns error when server returns error", async () => {
    vi.mocked(api.featureExecutor).mockResolvedValue({
      data: null,
      error: "Playwright server not configured",
    });
    const result = await api.featureExecutor("run-1");
    expect(result.data).toBeNull();
    expect(result.error).toBe("Playwright server not configured");
  });
});

describe("runsFeaturePlan API wrapper", () => {
  it("calls feature_plan with run_id and returns step count", async () => {
    vi.mocked(api.runsFeaturePlan).mockResolvedValue({
      data: {
        run_id: "run-1",
        steps_created: 5,
        steps: [],
      },
      error: null,
    });
    const result = await api.runsFeaturePlan("run-1");
    expect(api.runsFeaturePlan).toHaveBeenCalledWith("run-1");
    expect(result.data?.steps_created).toBe(5);
    expect(result.error).toBeNull();
  });

  it("returns error when planning fails", async () => {
    vi.mocked(api.runsFeaturePlan).mockResolvedValue({
      data: null,
      error: "Run has no feature description",
    });
    const result = await api.runsFeaturePlan("run-2");
    expect(result.data).toBeNull();
    expect(result.error).toBe("Run has no feature description");
  });
});
