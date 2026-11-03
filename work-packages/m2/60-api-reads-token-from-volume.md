# WP-M2-60: the API reads the token from the state volume

format: small-model
status: implemented
depends-on: WP-M2-59
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.5–§18.6, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- apps/api/src/update/client.ts — the client of the agent
- apps/api/src/config/env.ts — the environment schema of the API
- apps/api/src/update/routes.ts — the admin routes
- docker-compose.yml — the volumes of the services
- apps/agent/src/token.ts — where the agent writes its token

files-write:

- apps/api/src/update/client.ts
- apps/api/src/config/env.ts
- apps/api/src/update/routes.ts
- docker-compose.yml

interfaces:

- `resolveAgentToken(config)` in the API client: the environment value wins,
  otherwise the token file of the shared state volume
- the environment key `UPDATE_AGENT_TOKEN_FILE` (default
  `/agent-state/agent-token`); the API mounts the state volume read-only

## Task

1. The client of the agent resolves the bearer per call: the environment value
   wins, otherwise the token file of the shared state volume. Without both the
   client answers `update_agent_not_configured` — the agent has not written
   its token yet, so it does not run.
2. `apps/api/src/config/env.ts`: the new key `UPDATE_AGENT_TOKEN_FILE` with the
   default `/agent-state/agent-token`.
3. `apps/api/src/update/routes.ts`: the client gets the token file.
4. `docker-compose.yml`: the API mounts the state volume of the agent
   read-only (`update-state:/agent-state:ro`). The API never writes it.

## Non-goals

- No secret in the database and no secret in the administration.
- No change of the routes and no change of the protocol.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the client test
proves that the token file is used.

## Handoff

- Files changed: the four files of `files-write` plus the test.
- Interfaces added: `resolveAgentToken(config)` and the env key
  `UPDATE_AGENT_TOKEN_FILE`.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-61 (the guide in the administration).
- Open question: none.
