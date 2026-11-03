# WP-M2-59: the agent generates its own token

format: small-model
status: implemented
depends-on: WP-M2-58
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.5–§18.6, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- apps/agent/src/index.ts — the entry point of the agent
- apps/agent/src/config.ts — the environment of the agent
- apps/agent/src/server.ts — the token guard of the protocol
- docs/DECISIONS/0006-host-update-agent.md — the credential rule
- docker-compose.yml — the state volume of the agent

files-write:

- apps/agent/src/token.ts
- apps/agent/src/config.ts
- apps/agent/src/index.ts

interfaces:

- `resolveAgentToken(config)`, `readTokenFile(path)`, `writeTokenFile(path, token)`
  in `@stoerdesk/agent`: the bearer of the agent comes from the environment,
  from the state volume or is created there
- the environment key `UPDATE_AGENT_TOKEN_FILE` (default `/state/agent-token`)

## Task

1. Write `apps/agent/src/token.ts`: the bearer of the agent is the environment
   value; without one the agent reads the token of its state volume and creates
   one (32 random bytes, base64url) when it is missing. The value stays the same
   across restarts, so the API keeps talking to the same agent.
2. The token file is written readable for the API container, which runs as
   `node` — the API mounts the same volume read-only and reads the value there.
3. `apps/agent/src/config.ts`: `UPDATE_AGENT_TOKEN` becomes optional, the new
   key `UPDATE_AGENT_TOKEN_FILE` names the file inside the state volume.
4. `apps/agent/src/index.ts`: the server uses the resolved token.

## Non-goals

- No change of the protocol, no change of the run steps.
- No secret in the database and no secret in the repository.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the token test
proves that the environment wins, that the volume is used and that a created
token stays the same.

## Handoff

- Files changed: the three files of `files-write` plus the test.
- Interfaces added: the token helpers of the agent.
- Verified: `npm run check` green (357 tests).
- Follow-up WP: WP-M2-60 (the API reads the token from the volume).
- Open question: none.
