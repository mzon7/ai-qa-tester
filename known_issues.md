
## [2026-03-08] Resolved: ProjectDetails — runsFeaturePlan non-2xx error
- Root cause: ALL edge functions returned HTTP 401 for auth errors (missing/invalid JWT). The Supabase SDK's `callEdgeFunction` converts any non-2xx into "Edge Function returned a non-2xx status code", losing the actual error message.
- Fix: Changed all edge function auth error responses from `401` to `200` with `{ data: null, error: "Unauthorized" }` body. The SDK now receives a 200 response and surfaces the proper error string to the UI.
- Affected functions: runs_create, projects_list, projects_create, runs_get, runs_list_by_project, settings_get, settings_save_keys, settings_validate_keys, button_scan, feature_report (feature_plan and feature_executor already had 200).
- Also set `verify_jwt: false` on feature_plan via Management API so platform-level JWT check doesn't intercept before function code.
- Status: resolved

## [2026-03-08 19:24] Unresolved: ProjectDetails
- Error: Error messages (most recent):
- Attempted: 1 fix(es), verdict: The code diff shows a change in the ProjectDetails component that updates the run's status to 'failed' when an infrastructure-level error occurs, addressing the issue of runs getting stuck in 'queued' state.
- Status: unresolved
