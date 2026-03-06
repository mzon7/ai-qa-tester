import { useState } from "react";
import AppLayout from "../../session-handling-and-protected-routes/components/AppLayout";
import ProjectsList from "./ProjectsList";
import ProjectDetails from "./ProjectDetails";
import ProjectForm from "./ProjectForm";
import { useProjects } from "../lib/useProjects";
import type { Project } from "../../../lib/api";

type MobileView = "list" | "detail";

export default function ProjectsPage() {
  const { projects, loading, error, createProject, refresh } = useProjects();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [existedWarning, setExistedWarning] = useState(false);

  const handleSelect = (project: Project) => {
    setSelectedProject(project);
    setMobileView("detail");
  };

  const handleCreateClick = () => {
    setFormError(null);
    setExistedWarning(false);
    setShowForm(true);
  };

  const handleFormSubmit = async (targetUrl: string, name?: string) => {
    setFormLoading(true);
    setFormError(null);
    setExistedWarning(false);

    const { project, existed, error: err } = await createProject(targetUrl, name);

    setFormLoading(false);

    if (err || !project) {
      setFormError(err ?? "Failed to create project");
      return;
    }

    if (existed) {
      setExistedWarning(true);
      setTimeout(() => {
        setShowForm(false);
        setSelectedProject(project);
        setMobileView("detail");
        setExistedWarning(false);
      }, 1800);
      return;
    }

    setShowForm(false);
    setSelectedProject(project);
    setMobileView("detail");
  };

  return (
    <AppLayout>
      <div className="projects-layout">
        {/* Left panel: always rendered; hidden on mobile when in detail view */}
        <div className={`projects-list-col${mobileView === "detail" ? " projects-list-col-hidden" : ""}`}>
          <ProjectsList
            projects={projects}
            loading={loading}
            error={error}
            selectedId={selectedProject?.id ?? null}
            onSelect={handleSelect}
            onCreateClick={handleCreateClick}
          />
        </div>

        {/* Right panel: empty state or project details */}
        <div className={`projects-detail-col${mobileView === "list" ? " projects-detail-col-hidden" : ""}`}>
          {selectedProject ? (
            <ProjectDetails
              project={selectedProject}
              onBack={() => setMobileView("list")}
            />
          ) : (
            <div className="projects-empty-detail">
              <div className="projects-empty-detail-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.2" opacity="0.2" />
                  <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
                  <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.4" />
                  <line x1="24" y1="4" x2="24" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.3" />
                  <line x1="24" y1="38" x2="24" y2="44" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.3" />
                  <line x1="4" y1="24" x2="10" y2="24" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.3" />
                  <line x1="38" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.3" />
                </svg>
              </div>
              <p className="projects-empty-detail-title">Select a project</p>
              <p className="projects-empty-detail-body">
                Choose a project from the list, or{" "}
                <button className="plist-empty-create" onClick={handleCreateClick}>
                  create a new one
                </button>
                .
              </p>
            </div>
          )}
        </div>

        {/* Refresh button (top-right corner) — hidden visually but accessible */}
        <button
          className="projects-refresh"
          onClick={refresh}
          aria-label="Refresh project list"
          title="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M7 2l2-2M7 2l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Create project modal */}
      {showForm && (
        <ProjectForm
          onSubmit={handleFormSubmit}
          onCancel={() => { setShowForm(false); setFormError(null); }}
          loading={formLoading}
          error={formError}
          existedWarning={existedWarning}
        />
      )}
    </AppLayout>
  );
}
