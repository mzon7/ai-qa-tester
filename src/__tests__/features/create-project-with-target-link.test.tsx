/**
 * Tests: Create Project with Target Link
 *
 * Covers:
 *  1. Create project with a valid URL → saved and appears in the Projects list
 *  2. Create project with an invalid / unsupported URL → validation error shown,
 *     no project created
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../../lib/api", () => ({
  projectsList: vi.fn(),
  projectsCreate: vi.fn(),
  settingsGet: vi.fn(),
  settingsSaveKeys: vi.fn(),
  settingsValidateKeys: vi.fn(),
  // Needed because ProjectDetails now loads runs when a project is selected
  runsListByProject: vi.fn(() => Promise.resolve({ data: { runs: [] }, error: null })),
  runsCreate: vi.fn(),
  runsGet: vi.fn(),
}));

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

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/projects" }),
    Link: ({ children, ...props }: { children: ReactNode; to: string; [k: string]: unknown }) => (
      <a href={String(props.to)}>{children}</a>
    ),
  };
});

import { projectsList, projectsCreate } from "../../lib/api";
import ProjectsPage from "../../features/create-project-with-target-link/components/ProjectsPage";
import ProjectForm from "../../features/create-project-with-target-link/components/ProjectForm";

const mockProjectsList = vi.mocked(projectsList);
const mockProjectsCreate = vi.mocked(projectsCreate);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SAMPLE_PROJECT = {
  id: "proj-1",
  user_id: "user-1",
  name: "example.com",
  url: "https://example.com",
  status: "idle" as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  latest_run_id: null,
  latest_run_status: null,
  last_run_at: null,
};

/**
 * Render the full ProjectsPage and wait for the initial fetch to settle.
 * We wait for the DOM state that only appears once loading=false, so there
 * is no race between the initial projectsList promise and form submission.
 */
async function renderProjectsPage(initialProjects = [] as typeof SAMPLE_PROJECT[]) {
  mockProjectsList.mockResolvedValue({
    data: { projects: initialProjects },
    error: null,
  });

  const view = render(<ProjectsPage />);

  if (initialProjects.length === 0) {
    // "No projects yet." only renders when loading===false and list is empty
    await waitFor(() => {
      expect(screen.getByText("No projects yet.")).toBeInTheDocument();
    });
  } else {
    // Wait until all initial projects are rendered as list items
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBe(initialProjects.length);
    });
  }

  return view;
}

/** Open the "New project" form modal inside ProjectsPage. */
function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /create new project/i }));
}

/** Fill the Target URL field and submit the form. */
async function submitUrl(url: string) {
  fireEvent.change(screen.getByLabelText(/target url/i), { target: { value: url } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test cases ───────────────────────────────────────────────────────────────

describe("Create project with a valid URL", () => {
  it("calls projectsCreate and shows the new project in the list", async () => {
    await renderProjectsPage();

    mockProjectsCreate.mockResolvedValue({
      data: { project: SAMPLE_PROJECT, existed: false },
      error: null,
    });

    openForm();

    expect(screen.getByRole("dialog", { name: /create project/i })).toBeInTheDocument();

    await submitUrl("https://example.com");

    // projectsCreate must have been called with the normalised URL
    expect(mockProjectsCreate).toHaveBeenCalledWith("https://example.com", undefined);

    // The new project's hostname should appear in the project list.
    // Both the name and url columns render "example.com", so use getAllByText.
    await waitFor(() => {
      expect(screen.getAllByText("example.com").length).toBeGreaterThan(0);
    });
  });

  it("closes the form and selects the new project after successful creation", async () => {
    await renderProjectsPage();

    mockProjectsCreate.mockResolvedValue({
      data: { project: SAMPLE_PROJECT, existed: false },
      error: null,
    });

    openForm();
    await submitUrl("https://example.com");

    // Form dialog should be gone
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /create project/i })).not.toBeInTheDocument();
    });
  });

  it("shows the 'already exists' warning when the URL was a duplicate", async () => {
    await renderProjectsPage([SAMPLE_PROJECT]);

    mockProjectsCreate.mockResolvedValue({
      data: { project: SAMPLE_PROJECT, existed: true },
      error: null,
    });

    openForm();
    await submitUrl("https://example.com");

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/already exists/i);
    });
  });

  it("shows a server error alert when projectsCreate returns an error", async () => {
    await renderProjectsPage();

    mockProjectsCreate.mockResolvedValue({
      data: null,
      error: "Internal server error",
    });

    openForm();
    await submitUrl("https://example.com");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Internal server error");
    });

    // Form should remain open so the user can retry
    expect(screen.getByRole("dialog", { name: /create project/i })).toBeInTheDocument();
  });
});

describe("Create project with an invalid or unsupported URL", () => {
  it("shows a validation error for an ftp:// URL and does not call projectsCreate", async () => {
    const onSubmit = vi.fn();
    render(
      <ProjectForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} error={null} />
    );

    await submitUrl("ftp://files.example.com");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a validation error for a localhost URL and does not call projectsCreate", async () => {
    const onSubmit = vi.fn();
    render(
      <ProjectForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} error={null} />
    );

    await submitUrl("http://localhost:3000");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a validation error for a 127.0.0.1 URL and does not call projectsCreate", async () => {
    const onSubmit = vi.fn();
    render(
      <ProjectForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} error={null} />
    );

    await submitUrl("http://127.0.0.1:8080/app");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the Submit button disabled when the URL field is empty", async () => {
    render(
      <ProjectForm onSubmit={vi.fn()} onCancel={vi.fn()} loading={false} error={null} />
    );

    expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
  });

  it("clears the inline URL error when the user starts typing a new value", async () => {
    render(
      <ProjectForm onSubmit={vi.fn()} onCancel={vi.fn()} loading={false} error={null} />
    );

    // Trigger a validation error
    await submitUrl("ftp://bad");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Start typing a new URL — error should clear
    fireEvent.change(screen.getByLabelText(/target url/i), {
      target: { value: "https://" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
