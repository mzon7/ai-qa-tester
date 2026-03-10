import { useState, useEffect, useCallback } from "react";
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { projectsCreate } from "../../../lib/api";
import type { Project, RunStatus } from "../../../lib/api";
import { supabase, dbTable } from "../../../lib/supabase";

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
 * Uses direct DB queries (not edge functions) to avoid auth-token issues.
 * RLS enforces user_id scoping automatically.
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

    const fetchProjects = async () => {
      const { data: projectRows, error: projErr } = await supabase
        .from(dbTable("projects"))
        .select("id, user_id, name, url, status, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (projErr || !projectRows) {
        setLoading(false);
        if (projErr) setError(projErr.message);
        setProjects([]);
        return;
      }

      if (projectRows.length === 0) {
        setLoading(false);
        setProjects([]);
        return;
      }

      // Enrich with latest run per project
      const projectIds = projectRows.map((p) => p.id);
      const { data: runs } = await supabase
        .from(dbTable("qa_runs"))
        .select("id, project_id, status, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      setLoading(false);

      const latestRunMap = new Map<string, { id: string; status: string; created_at: string }>();
      for (const run of (runs ?? [])) {
        if (!latestRunMap.has(run.project_id)) {
          latestRunMap.set(run.project_id, run);
        }
      }

      const enriched = projectRows
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => {
          const lr = latestRunMap.get(p.id);
          return {
            ...p,
            latest_run_id: lr?.id ?? null,
            latest_run_status: (lr?.status ?? null) as RunStatus | null,
            last_run_at: lr?.created_at ?? null,
          } as Project;
        });

      setProjects(enriched);
    };

    fetchProjects();

    return () => { cancelled = true; };
  }, [rev]);

  const createProject = useCallback(
    async (targetUrl: string, name?: string) => {
      const { data, error: err } = await projectsCreate(targetUrl, name);

      if (err || !data) {
        const msg = err ?? "Failed to create project";
        const isAuthError = msg.toLowerCase().includes("unauthorized") ||
          msg.toLowerCase().includes("missing authorization");
        if (!isAuthError) {
          reportSelfHealError(supabase, {
            category: "frontend",
            source: "useProjects",
            errorMessage: msg,
            projectPrefix: "ai_qa_tester_",
            metadata: { action: "projectsCreate" },
          });
        }
        return { project: null, existed: false, error: msg };
      }

      const { project, existed } = data;

      setProjects((prev) => {
        const without = prev.filter((p) => p != null && p.id !== project.id);
        return [project, ...without];
      });

      return { project, existed, error: null };
    },
    []
  );

  return { projects, loading, error, createProject, refresh };
}
