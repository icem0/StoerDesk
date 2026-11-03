# WP-M2-54: the admin update API

format: small-model
status: planned
depends-on: WP-M2-53
phase: 2
context-budget: 18k tokens
spec: specs/18-self-update.md §18.4–§18.6
spec-lines: 130

files-read:

- apps/api/src/integrations/bmacloud/routes.ts — the admin route style
- apps/api/src/integrations/bmacloud/client.ts — the client style
- apps/api/src/auth/requirePermission.ts — the permission guard
- apps/api/src/config/env.ts — the environment schema
- apps/api/src/db/schema.ts — the `update_runs` table of WP-M2-50
- apps/api/src/index.ts — the route registration

files-write:

- apps/api/src/update/client.ts
- apps/api/src/update/routes.ts
- apps/api/src/config/env.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/admin/update/status`, `POST /api/v1/admin/update/run`,
  `GET /api/v1/admin/update/runs` — guarded by `system.update`
- `createUpdateAgentClient(options)`: calls the agent with the bearer
  `UPDATE_AGENT_TOKEN` and validates every answer with the shared schemas

## Task

1. Write `apps/api/src/update/client.ts`: a small client for the agent with
   `status()`, `run()` and `runs()`. It sends `Authorization: Bearer
   <UPDATE_AGENT_TOKEN>`, uses a short timeout, and answers
   `{ code: 'update_agent_unreachable' }` when the agent cannot be reached or
   answers something the shared schema rejects. The token is never logged and
   never part of an answer.
2. Write `apps/api/src/update/routes.ts`:
   - `GET /status` — the agent state, the known version and the last run of the
     API; it reconciles a `RUNNING` row with the agent's state.
   - `POST /run` — refuses with `409` while a run is active, with
     `429` inside the cooldown, writes the `update_runs` row and starts the
     run; answers `202`.
   - `GET /runs` — the history of the `update_runs` table, newest first.
   - every route is guarded with `requirePermission('system.update')`; errors
     are `{ code, params }`, never translated text and never a secret.
3. Add `UPDATE_AGENT_URL` and `UPDATE_AGENT_TOKEN` to the environment schema of
   `apps/api/src/config/env.ts` (the token optional — without it the API
   answers that the agent is not configured).
4. Register the routes in `apps/api/src/index.ts` under the admin prefix.

## Non-goals

- No UI, no i18n (WP-M2-55).
- No shell, no `git`, no `docker` in the API: the API only speaks HTTP to the
  agent.
- No writing of the run result by the API — the agent reports it, the API
  stores it.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the route test
proves the guard, the `409`, the `429`, the `202` and the reconciliation of a
`RUNNING` row.

## Handoff

- Files changed: the four files of `files-write` plus the test.
- Interfaces added: the three admin routes and the agent client.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-55 (the admin UI).
- Open question: none.
