# Project Rules

## Database Rules
- Shared Supabase — ALL table names prefixed with "ai_qa_tester_"
- Use `dbTable(name)` and `supabase` from `src/lib/supabase.ts` (provided by @mzon7/zon-incubator-sdk) for all table references
- Create/alter tables via Management API (env vars $SUPABASE_PROJECT_REF and $SUPABASE_MGMT_TOKEN are ALREADY SET — just use them directly):
  ```
  curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query": "..."}'
  ```
- To CHECK if tables exist:
  ```
  curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT tablename FROM pg_tables WHERE schemaname='\''public'\'' AND tablename LIKE '\''ai_qa_tester_%'\'';"}'
  ```
- **RLS is auto-managed**: The daemon automatically runs `setup_table_rls()` on any project table missing policies after each command
  - You do NOT need to manually create RLS policies — they are applied automatically (anon, authenticated, service_role)
  - For tighter security on specific tables, replace the broad auto-policies with specific ones
- Server-side API routes MUST use the service-role/admin Supabase client, NOT the anon client — this bypasses RLS and avoids policy gaps
- Client-side (browser) code may use the anon client — ensure matching RLS policies exist for every operation

## Auth Rules
- Auth components are provided by @mzon7/zon-incubator-sdk/auth: AuthProvider, useAuth, ProtectedRoute, AuthCallback
- Email confirmations are ENABLED — signUp() returns null session until user confirms email
- The /auth/callback route uses the AuthCallback component to exchange codes for sessions
- Built-in Supabase mailer: 4 emails/hour limit (dev only — configure SMTP for production)

## AI API Rules
- Only use AI/LLM APIs for which API keys are available in .env.local
- Use OpenAI (GPT) via $OPENAI_API_KEY or xAI (Grok) via $GROK_API_KEY
- Do NOT use Anthropic SDK or any other AI provider — no ANTHROPIC_API_KEY is available
- Default to Grok (xAI) unless the user specifies GPT

## Architecture: Frontend/Backend Separation
- NEVER call external APIs (AI, payment, etc.) directly from browser/client code
- All external API calls MUST go through server-side routes (Supabase Edge Functions or server-side scripts)
- Use `callEdgeFunction()` from @mzon7/zon-incubator-sdk to call edge functions
- API keys must NEVER be exposed client-side (no VITE_ prefix for secrets)
- For long-running operations (AI calls, processing): write a task row to DB, process server-side, client polls for results
- DB writes that must not be lost should go through API routes, not direct client Supabase calls

## When Edge Functions Are Not Enough
- Edge functions (Deno/V8 isolates) CANNOT run binaries, spawn processes, or use tools like Playwright/Puppeteer
- If a feature requires capabilities beyond edge functions (headless browsers, long-running processes, system binaries, large file processing):
  1. Create a server-side script in the project repo (e.g. `server/button-scan.ts`) that runs on the project's Linux server
  2. Use Node.js with npm packages (Playwright, Puppeteer, etc.) — install what you need
  3. The script can be triggered via a simple HTTP server (Express/Fastify), a cron job, or a CLI command
  4. Store results in Supabase (same DB, same prefixed tables) so the frontend can read them
  5. For the frontend to trigger the script: create an edge function that SSHs or HTTP-calls the server, or use a DB-polling pattern (insert a task row, server picks it up)
- Do NOT silently downgrade to a weaker approach (e.g. HTML parsing instead of real browser testing) — provision the infrastructure you need

## SDK Usage
- This project uses `@mzon7/zon-incubator-sdk` — import from it, do NOT rewrite these utilities:
  - `import { createProjectClient, dbTable, validateEnv, callEdgeFunction } from '@mzon7/zon-incubator-sdk'`
  - `import { AuthProvider, useAuth, ProtectedRoute, AuthCallback } from '@mzon7/zon-incubator-sdk/auth'`
  - `import { installFrontendErrorCapture, reportSelfHealError, withDbErrorCapture } from '@mzon7/zon-incubator-sdk'`
- The Supabase client and dbTable helper are already configured in `src/lib/supabase.ts`

## Self-Heal Error Reporting (REQUIRED)

This project is monitored by the Zon AGI Incubator self-heal system. All errors MUST be reported to the shared `incubator_self_heal_errors` table.

### Frontend Error Capture (ALREADY INSTALLED)

`installFrontendErrorCapture(supabase, "ai_qa_tester_")` is called in `src/main.tsx`. It automatically captures `window.onerror` and `unhandledrejection` events. **Do not remove it.**

### Database Error Capture

For critical Supabase queries, wrap with `withDbErrorCapture` from the SDK:

```typescript
import { withDbErrorCapture } from "@mzon7/zon-incubator-sdk";
import { supabase, dbTable } from "@/lib/supabase";

// Instead of:
const { data, error } = await supabase.from(dbTable("runs")).select("*");

// Use:
const { data, error } = await withDbErrorCapture(
  supabase,
  dbTable("runs"),
  supabase.from(dbTable("runs")).select("*"),
);
```

Use `withDbErrorCapture` for:
- All `.insert()`, `.update()`, `.delete()` operations
- Critical `.select()` queries that power main UI features
- Skip for non-critical reads like analytics/optional data

### Manual Error Reporting

For try/catch blocks and edge function error handling, use `reportSelfHealError`:

```typescript
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { supabase } from "@/lib/supabase";

try {
  // risky operation
} catch (err) {
  reportSelfHealError(supabase, {
    category: "frontend",
    source: "ComponentName",
    errorMessage: err.message,
    errorStack: err.stack,
    projectPrefix: "ai_qa_tester_",
    metadata: { context: "what was happening" },
  });
}
```

### Edge Function Errors

`callEdgeFunction()` from the SDK already dual-writes errors to both `incubator_edge_function_errors` and `incubator_self_heal_errors`. No extra work needed — just always use `callEdgeFunction()` instead of raw `supabase.functions.invoke()`.

### Categories

- `"frontend"` — React component errors, unhandled rejections, client-side failures
- `"database"` — Supabase query failures, RLS errors, constraint violations
- `"build_deploy"` — Build failures, typecheck errors (reported by daemon)
- `"edge_function"` — Edge function invocation failures (auto-reported by callEdgeFunction)

### Rules

1. **Never swallow errors silently** — every catch block should either re-throw or call `reportSelfHealError`
2. **Always include projectPrefix** — use `"ai_qa_tester_"` for this project
3. **Fire-and-forget** — error reporting never blocks the caller; never awaited
4. **Use SDK helpers** — do NOT write raw inserts to `incubator_self_heal_errors`; use the SDK functions

## Project Context

## AI QA Tester — Coding Conventions (for Claude)

### FILE STRUCTURE (mandatory)
- Every feature lives in:
  `src/features/<feature-name>/components/`, `src/features/<feature-name>/lib/`, `src/features/<feature-name>/<feature-name>.test.ts`
- Route files are thin wrappers only:
  - `src/pages/*.tsx` imports + composes from `src/features/*`
  - Any API/edge callers live in `src/lib/api.ts` (typed wrappers), not in pages.

### API RESPONSE SHAPE (mandatory)
- All edge/API routes return: `{ data: T, error: string | null }`
- Client wrappers in `src/lib/api.ts` must preserve this shape and type it.

### DB / SUPABASE (mandatory)
- Use Supabase **server client** in edge/API routes; **browser client** in components.
- Every query must be scoped by tenant key:
  - This project uses `user_id` on most tables (treat as the scoping key).
  - If an `org_id` is introduced later, scope by it everywhere.

### NO NEW LIBRARIES (mandatory)
- Do not add dependencies without explicit user approval.

---

## Data Model (Supabase Postgres)
- **qa_projects**: `id`, `user_id`, `name?`, `target_url`, timestamps
  - 1 project → many runs
- **qa_runs**: `id`, `project_id`, `user_id`, `status` (`queued|running|passed|failed|canceled`),
  `scope_mode` (`everything|instructions`), `instructions?`, timing fields, `summary?`, `error?`
- **qa_run_steps**: `id`, `run_id`, `idx`, `title`, `expected`, `status` (`pending|running|passed|failed|skipped`), `notes`, timing fields
- **qa_run_logs**: `id`, `run_id`, `ts`, `level` (`info|warn|error`), `message`, `step_id?`
- **qa_artifacts**: `id`, `run_id`, `step_id?`, `type` (`screenshot|video|trace|console|network|log`), `storage_path`, `mime_type`, `created_at`
- **qa_conversations**: `id`, `user_id`, `title?`, `memory_enabled`, timestamps
- **qa_messages**: `id`, `conversation_id`, `user_id`, `role` (`user|assistant|system|tool`), `content`, `created_at`, `meta` (jsonb)
- **qa_settings**: `user_id` (PK), `llm_provider`, `llm_api_key_encrypted`, `memory_retention_days`, timestamps

## Integrations / External Services
- **ai-assistant-core** is wrapped only via `src/lib/aiAssistant.ts` (no direct usage elsewhere).
- **LLM calls happen only in edge functions**; client never sends provider keys to third parties.
- **Supabase Storage** bucket: `qa-artifacts` (private)
  - Client obtains artifact URLs via `artifacts_signed_url` edge function only.

## Edge Functions (call via `callEdgeFunction` wrappers)
- Chat: `chat_stream` (chunked streaming: tokens + tool events)
- Projects: `projects_create`, `projects_list`, `projects_get`
- Runs: `runs_create`, `runs_get`, `runs_list_by_project`, `runs_rerun`
- Streaming: `runs_stream` (SSE for status/log/step updates)
- Settings/memory: `settings_save_keys`, `settings_validate_keys`, `settings_get`, `memory_clear`
- Artifacts: `artifacts_signed_url`

## Frontend State + Streaming
- **TanStack Query** for all server state (projects, runs, messages, settings).
- **Zustand** only for cross-page UI state (modals/toasts) via `src/state/stores/useUiStore.ts`.
- Live run updates use **SSE/EventSource** via `src/lib/sse.ts`; on completion, invalidate relevant queries.

## Security / Validation (project-specific)
- Validate `target_url` with allowlist `http/https`; block localhost/private IP ranges (use `src/lib/validators.ts`).
- Rate limiting is enforced in edge functions for run creation + chat (assume it exists; don't bypass with client retries).
- Artifact access is always via signed URLs; never expose `storage_path` directly in UI links.

## Edge Function Conventions
- Every edge function MUST have a `test-fixture.json` in its directory (e.g. `supabase/functions/my-func/test-fixture.json`)
- The fixture is a JSON request body used by the automated smoke test system to verify the function works after deployment
- Use minimal/safe test data that exercises the happy path (e.g. a short test message for chat functions)
- If the function needs a real DB record ID, use a zero UUID that returns a controlled 4xx (not 5xx)
- Edge functions are auto-deployed by the build system — you do NOT need to deploy manually
## Runtime Environment
- This project runs on a Linux server with full shell access
- Server credentials (SSH keys, IPs) for external servers are injected automatically from the database — check your context for [SERVER CREDENTIALS] block
- If you need to deploy to an external server, use the SSH credentials provided in your context
- If you create new SSH keys or discover new servers, store them via the Supabase API (instructions in your context)
- Do NOT create TODOs asking the user to deploy — if you have SSH access, do it yourself
- Do NOT provision new droplets unless explicitly asked