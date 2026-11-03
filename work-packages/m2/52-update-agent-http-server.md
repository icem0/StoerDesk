# WP-M2-52: the update agent HTTP server

format: small-model
status: planned
depends-on: WP-M2-51
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.5–§18.6
spec-lines: 130

files-read:

- apps/agent/src/update-runner.ts — the runner of WP-M2-51
- packages/shared/src/schemas/update.ts — the agent schemas of WP-M2-49
- apps/api/src/integrations/bmacloud/routes.ts — the error and route style
- apps/api/src/auth/requirePermission.ts — the guard style of the API
- apps/api/src/index.ts — how the API registers its routes

files-write:

- apps/agent/src/server.ts
- apps/agent/src/index.ts
- apps/agent/src/config.ts
- apps/agent/vitest.config.ts

interfaces:

- `createAgentServer(options)` in `@stoerdesk/agent`: `GET /status`,
  `POST /run`, `GET /runs` behind the bearer `UPDATE_AGENT_TOKEN`
- the agent answers the schemas `agentStatusSchema` and `agentRunSchema`

## Task

1. Write `apps/agent/src/config.ts`: read the environment with a Zod schema —
   `UPDATE_AGENT_TOKEN` (required, at least 32 characters), `UPDATE_AGENT_PORT`
   (default `8080`), `UPDATE_AGENT_CHECKOUT` (default `/repo`),
   `UPDATE_AGENT_COMPOSE_FILE` (default `/repo/docker-compose.yml`),
   `UPDATE_AGENT_PROJECT_DIR` (default `/repo`), `UPDATE_AGENT_STATE_DIR`
   (default `/state`).
2. Write `apps/agent/src/server.ts` with `node:http` — no web framework, so the
   agent image stays free of runtime dependencies:
   - every request without `Authorization: Bearer <token>` answers `401`; the
     token is compared with `crypto.timingSafeEqual`.
   - `GET /status` answers `{ state, checkout: { version, commit? }, lastRun? }`.
   - `POST /run` starts one run and answers `202` with the run; a run that is
     already active answers `409`.
   - `GET /runs` answers the runs the agent knows.
   - no other method, no other path; the answer is JSON, never a stack trace.
3. Write `apps/agent/src/index.ts`: read the configuration, create the runner
   and the server, listen on the configured port, load the last run from
   `<state dir>/last-run.json` and write it after every run.
4. Write `apps/agent/vitest.config.ts` like the one of `apps/api` and add the
   test of the server: `401` without a token, `202` for a run, `409` for a
   second run.

## Non-goals

- No image, no compose service, no env template (WP-M2-53).
- No database access — the agent never sees the database.
- No CORS, no static files, no upload: the agent serves a fixed protocol.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the server test
proves the token guard, the status answer and the run conflict.

## Handoff

- Files changed: the four files of `files-write` plus the test.
- Interfaces added: `createAgentServer`, the agent endpoints.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-53 (image, compose service, env wiring).
- Open question: none.
