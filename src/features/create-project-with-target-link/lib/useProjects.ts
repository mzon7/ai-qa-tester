import { useState, useEffect, useCallback } from "react";
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { projectsList, projectsCreate } from "../../../lib/api";
import type { Project } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  error: string | null;
  createProject: (targetUrl: string, name?: string) => Promise<{
    project: Project | null;
    existed: boolean;
    error: string | null;
  }>;
  refresh: () => void;
}

/**
 * Manages the project list for the current user.
 * Fetches on mount and exposes a create function that optimistically
 * prepends the new project to the list.
 */
export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    projectsList().then(({ data, error: err }) => {
      if (cancelled) return;
      setLoading(false);
      if (err || !data) {
        const msg = err ?? "Failed to load projects";
        setError(msg);
        reportSelfHealError(supabase, {
          category: "frontend",
          source: "useProjects",
          errorMessage: msg,
          projectPrefix: "ai_qa_tester_",
          metadata: { action: "projectsList" },
        });
        return;
      }
      setProjects(data.projects ?? []);
    });

    return () => { cancelled = true; };
  }, [rev]);

  const createProject = useCallback(
    async (targetUrl: string, name?: string) => {
      const { data, error: err } = await projectsCreate(targetUrl, name);

      if (err || !data) {
        const msg = err ?? "Failed to create project";
        reportSelfHealError(supabase, {
          category: "frontend",
          source: "useProjects",
          errorMessage: msg,
          projectPrefix: "ai_qa_tester_",
          metadata: { action: "projectsCreate" },
        });
        return { project: null, existed: false, error: msg };
      }

      const { project, existed } = data;

      setProjects((prev) => {
        // If the project already existed, move it to the top; otherwise prepend
        const without = prev.filter((p) => p.id !== project.id);
        return [project, ...without];
      });

      return { project, existed, error: null };
    },
    []
  );

  return { projects, loading, error, createProject, refresh };
}
