# WP-M2-57: the status route names the reason

format: small-model
status: implemented
depends-on: WP-M2-56
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4–§18.6
spec-lines: 130

files-read:

- apps/api/src/update/routes.ts — the status route of WP-M2-54
- apps/api/src/update/client.ts — the error codes of the client
- packages/shared/src/schemas/update.ts — the answer of the status route
- apps/web/src/admin/update-host-update.tsx — where the reason is shown
- docs/DEPLOYMENT.md — what the operator has to do

files-write:

- packages/shared/src/schemas/update.ts
- apps/api/src/update/routes.ts

interfaces:

- the answer of `GET /api/v1/admin/update/status` carries `agent.error`:
  `update_agent_not_configured` | `update_agent_unreachable` |
  `update_agent_bad_response` | `null`

## Task

1. Extend the answer of the status route: `agent` gains `error`, the reason why
   the agent cannot be reached — `null` when the agent answers.
2. Map the error of the client to the reason: `update_agent_not_configured`
   (no token in the environment), `update_agent_bad_response` (the agent
   answered something invalid) and `update_agent_unreachable` for everything
   else, including `update_already_running`, which cannot happen while reading
   the status.
3. The reason is a fixed code, never a translated text and never a secret.

## Non-goals

- No change of the routes, no new route, no new permission.
- No change of the agent — it stays as it is.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the client test
proves the three reasons.

## Handoff

- Files changed: the two files of `files-write` plus the tests.
- Interfaces added: `agent.error` in the answer of the status route,
  `UPDATE_AGENT_ERROR_CODES` and `updateAgentErrorSchema` in the shared
  package.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-58 (the page shows the reason).
- Open question: none.
