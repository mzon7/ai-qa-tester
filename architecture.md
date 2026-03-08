# Architecture

## Stack
- **Frontend**: React + Vite (TypeScript)
- **Backend**: Supabase (shared instance, table prefix: ai_qa_tester_)
- **Edge Functions**: Deno runtime, deployed via incubator daemon
- **SDK**: @mzon7/zon-incubator-sdk (provides supabase client, callEdgeFunction, error reporting)
- **Playwright Server**: Node.js on droplet (159.203.58.51), runs browser-based tests

## Data Flow
1. User action → React component → callEdgeFunction(supabase, functionName, body)
2. Edge function processes request → returns { data, error }
3. SDK unwraps response → component receives typed data
4. On error: SDK logs to incubator_self_heal_errors → daemon auto-fixes

## Key Files
- `src/lib/supabase.ts` — Supabase client + dbTable helper
- `src/lib/api.ts` — API wrapper functions (uses callEdgeFunction)
- `src/features/` — Feature modules (components, lib, tests)
- `supabase/functions/` — Edge functions (projects_create, projects_list, runs_create, etc.)
- `CLAUDE.md` — Agent rules

## Test Infrastructure
- Playwright server runs on the same droplet as the app
- Tests execute against the live dev server (port 4001)
- Results stored in ai_qa_tester_runs / ai_qa_tester_test_results tables
