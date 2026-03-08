
## [2026-03-08 18:53] Resolved: ProjectDetails — runsFeaturePlan non-2xx error
- Root cause: `feature_plan` edge function returned 422 for vague descriptions; SDK surfaces this as "Edge Function returned a non-2xx status code"
- Fix 1: Edge function changed to always return 200 (vague descriptions return `{ data: { needs_input: true }, error: null }`)
- Fix 2: Frontend `triggerFeatureTest` now marks the run as "failed" in DB when an infrastructure-level error occurs (non-2xx), preventing runs from getting stuck in "queued" state
- Status: resolved
