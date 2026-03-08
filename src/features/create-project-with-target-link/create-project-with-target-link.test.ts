/**
 * Tests: Create Project with Target Link
 *
 * Unit tests for URL validation logic and API wrapper behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateTargetUrl, normalizeUrl } from "../../lib/validators";

// ─── validateTargetUrl ────────────────────────────────────────────────────────

describe("validateTargetUrl — valid URLs", () => {
  it("accepts https URLs", () => {
    expect(validateTargetUrl("https://example.com")).toBeNull();
  });

  it("accepts http URLs", () => {
    expect(validateTargetUrl("http://example.com")).toBeNull();
  });

  it("accepts URLs with paths and query strings", () => {
    expect(validateTargetUrl("https://app.example.com/dashboard?env=prod")).toBeNull();
  });

  it("accepts URLs with subdomains", () => {
    expect(validateTargetUrl("https://staging.myapp.io")).toBeNull();
  });
});

describe("validateTargetUrl — invalid / blocked URLs", () => {
  it("rejects an empty string", () => {
    expect(validateTargetUrl("")).not.toBeNull();
  });

  it("rejects a plain string that is not a URL", () => {
    expect(validateTargetUrl("not-a-url")).not.toBeNull();
  });

  it("rejects ftp:// scheme", () => {
    expect(validateTargetUrl("ftp://example.com")).not.toBeNull();
  });

  it("rejects localhost", () => {
    expect(validateTargetUrl("http://localhost:3000")).not.toBeNull();
  });

  it("rejects 127.0.0.1", () => {
    expect(validateTargetUrl("http://127.0.0.1/admin")).not.toBeNull();
  });

  it("rejects 10.x.x.x private IP range", () => {
    expect(validateTargetUrl("http://10.0.0.1")).not.toBeNull();
  });

  it("rejects 172.16.x.x private IP range", () => {
    expect(validateTargetUrl("http://172.16.0.1")).not.toBeNull();
  });

  it("rejects 192.168.x.x private IP range", () => {
    expect(validateTargetUrl("http://192.168.1.100")).not.toBeNull();
  });

  it("rejects cloud metadata endpoint 169.254.169.254", () => {
    expect(validateTargetUrl("http://169.254.169.254/latest/meta-data/")).not.toBeNull();
  });
});

// ─── normalizeUrl ─────────────────────────────────────────────────────────────

describe("normalizeUrl", () => {
  it("removes trailing slash on root path", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("preserves non-root paths", () => {
    expect(normalizeUrl("https://example.com/app/")).toBe("https://example.com/app/");
  });

  it("lowercases scheme and host", () => {
    expect(normalizeUrl("HTTPS://Example.COM")).toBe("https://example.com");
  });

  it("preserves query string", () => {
    expect(normalizeUrl("https://example.com/?foo=bar")).toBe("https://example.com?foo=bar");
  });
});

// ─── projectsCreate API wrapper ───────────────────────────────────────────────

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {},
  dbTable: (n: string) => `ai_qa_tester_${n}`,
}));

import { callEdgeFunction } from "@mzon7/zon-incubator-sdk";
import { projectsCreate, projectsList } from "../../lib/api";

const mockCall = vi.mocked(callEdgeFunction);

beforeEach(() => vi.clearAllMocks());

describe("projectsCreate", () => {
  it("calls projects_create with targetUrl", async () => {
    mockCall.mockResolvedValueOnce({
      data: { project: { id: "p1", url: "https://example.com" }, existed: false },
      error: null,
    });
    await projectsCreate("https://example.com");
    expect(mockCall).toHaveBeenCalledWith(
      expect.anything(),
      "projects_create",
      { targetUrl: "https://example.com" }
    );
  });

  it("includes name when provided", async () => {
    mockCall.mockResolvedValueOnce({ data: { project: {}, existed: false }, error: null });
    await projectsCreate("https://example.com", "My App");
    expect(mockCall).toHaveBeenCalledWith(
      expect.anything(),
      "projects_create",
      { targetUrl: "https://example.com", name: "My App" }
    );
  });

  it("returns error when edge function fails", async () => {
    mockCall.mockResolvedValueOnce({ data: null, error: "Private IP not allowed" });
    const result = await projectsCreate("http://192.168.1.1");
    expect(result.error).toBe("Private IP not allowed");
    expect(result.data).toBeNull();
  });

  it("returns existed=true when a duplicate project URL is used", async () => {
    mockCall.mockResolvedValueOnce({
      data: { project: { id: "existing-p" }, existed: true },
      error: null,
    });
    const result = await projectsCreate("https://example.com");
    expect(result.data?.existed).toBe(true);
  });
});

describe("projectsList", () => {
  it("calls projects_list with empty body", async () => {
    mockCall.mockResolvedValueOnce({ data: { projects: [] }, error: null });
    await projectsList();
    expect(mockCall).toHaveBeenCalledWith(expect.anything(), "projects_list", {});
  });

  it("returns the projects array", async () => {
    const projects = [{ id: "p1", url: "https://a.com" }, { id: "p2", url: "https://b.com" }];
    mockCall.mockResolvedValueOnce({ data: { projects }, error: null });
    const result = await projectsList();
    expect(result.data?.projects).toHaveLength(2);
  });

  it("returns data with undefined projects when edge function omits the field", async () => {
    // Regression: if the API returns data without a projects field,
    // useProjects must not set state to undefined (fixed with ?? [])
    mockCall.mockResolvedValueOnce({ data: {}, error: null });
    const result = await projectsList();
    // The API wrapper returns whatever the edge function sends;
    // the guard is in useProjects: data.projects ?? []
    expect(result.data?.projects).toBeUndefined();
    // Confirm the nullish coalescing guard produces an empty array
    const safeProjects = result.data?.projects ?? [];
    expect(safeProjects).toEqual([]);
  });
});

// ─── useProjects hook ─────────────────────────────────────────────────────────

import { renderHook, waitFor } from "@testing-library/react";
import { useProjects } from "./lib/useProjects";

vi.mock("./lib/../../../lib/supabase", () => ({
  supabase: {},
  dbTable: (n: string) => `ai_qa_tester_${n}`,
}));

vi.mock("@mzon7/zon-incubator-sdk", () => ({
  callEdgeFunction: vi.fn(),
  reportSelfHealError: vi.fn(),
}));

describe("useProjects — null safety", () => {
  it("initialises projects as an empty array", () => {
    mockCall.mockResolvedValueOnce({ data: { projects: [] }, error: null });
    const { result } = renderHook(() => useProjects());
    expect(Array.isArray(result.current.projects)).toBe(true);
  });

  it("handles data.projects being undefined without throwing (regression)", async () => {
    // Simulates an edge function returning data without a 'projects' key
    mockCall.mockResolvedValueOnce({ data: {}, error: null });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // State must remain an array — not undefined
    expect(Array.isArray(result.current.projects)).toBe(true);
    expect(result.current.projects).toHaveLength(0);
  });

  it("populates projects when the API returns a valid array", async () => {
    const projects = [{ id: "p1", url: "https://example.com", user_id: "u1", name: "Test", status: "active", created_at: "", updated_at: "", latest_run_id: null, latest_run_status: null, last_run_at: null }];
    mockCall.mockResolvedValueOnce({ data: { projects }, error: null });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].id).toBe("p1");
  });

  it("sets error state when the API returns an error", async () => {
    mockCall.mockResolvedValueOnce({ data: null, error: "Unauthorized" });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Unauthorized");
    expect(result.current.projects).toEqual([]);
  });
});
