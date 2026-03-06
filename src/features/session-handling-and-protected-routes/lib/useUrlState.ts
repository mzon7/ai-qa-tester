import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Persist minimal UI state in the URL query string so that page refreshes
 * restore context (e.g. selected project ID, active run ID).
 *
 * @example
 * const [projectId, setProjectId] = useUrlState("project");
 * // URL becomes: /projects?project=abc123
 * // On refresh: projectId === "abc123"
 */
export function useUrlState(key: string): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = searchParams.get(key);

  const setValue = useCallback(
    (newValue: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue === null || newValue === "") {
            next.delete(key);
          } else {
            next.set(key, newValue);
          }
          return next;
        },
        { replace: true }
      );
    },
    [key, setSearchParams]
  );

  return [value, setValue];
}
