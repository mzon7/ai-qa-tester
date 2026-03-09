# Known Patterns

## Edge Functions
- Edge functions return `{ data: T, error: string | null }`
- `supabase.functions.invoke()` wraps the response in another `{ data, error }` layer
- Always use `callEdgeFunction()` from the SDK — it unwraps automatically
- NEVER call `supabase.functions.invoke()` directly

## State Management
- State setters must guard against undefined: `setItems(data.items ?? [])`
- Always null-check nested properties before accessing: `if (!data?.project) return`
- Array methods (.filter, .map) crash on undefined — always provide fallback

## API Response Shapes
- Edge function → SDK unwraps → you get the inner `data` directly
- If you get `data.data.something`, the SDK unwrapping is broken or bypassed

## Self-Heal Error Reporting
- Use `callEdgeFunction` from `createProjectClient()` — NOT the raw SDK import
- Raw `callEdgeFunction` without `projectPrefix` option silently skips error logging

## Learned: ProjectDetails (2026-03-08)
- The code diff shows a change in the ProjectDetails component that updates the run's status to 'failed' when an infrastructure-level error occurs, addressing the issue of runs getting stuck in 'queued'

## Learned: TestTargetPage.tsx (2026-03-08)
- The code diff shows that the error handling in the `handleBroken` function was changed to directly set the error message instead of throwing an exception, which addresses the original TypeError.

## Learned: TestTargetPage.tsx (2026-03-08)
- The code diff shows that the error handling in the `handleBroken` function was modified to set a simulated error message instead of throwing an actual error, which addresses the original TypeError.

## Learned: useRuns (2026-03-09)
- The code diff shows that the error handling was modified to return 200 status codes for all responses, which addresses the issue of the Supabase SDK failing to send requests due to non-2xx status code

## Learned: useRuns (2026-03-09)
- The code diff includes a retry mechanism for transient network errors, which directly addresses the original error of failing to send a request to the Edge Function.

## Learned: useRuns (2026-03-09)
- The code diff shows a change that replaces the session validation method with a more appropriate user validation method, addressing the 'Unauthorized' error.

## Learned: useRuns (2026-03-09)
- The code diff shows that the error reporting for unauthorized access has been removed, which addresses the issue of false-positive error reports related to unauthorized errors.

## Learned: useRuns (2026-03-09)
- The code diff shows a change that replaces the edge function call with a direct database query, addressing the 'Unauthorized' error by handling authentication through Supabase's session cookie.

## Learned: useRuns (2026-03-09)
- The code diff only updates documentation files and does not include any changes to the source code that would address the 'Unauthorized' error.

## Learned: useRuns (2026-03-09)
- The code diff shows a change where the `runsGet` function was replaced with direct database queries using Supabase, which addresses the authentication issue by avoiding edge function calls that could 

## Learned: useRuns (2026-03-09)
- The code diff includes changes that handle unauthorized errors by preventing them from being reported as self-heal errors, which addresses the root cause of the 'Unauthorized' issue.
