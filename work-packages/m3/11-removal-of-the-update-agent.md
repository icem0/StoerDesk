# WP-M3-11: the removal of the update agent

format: small-model
status: planned
depends-on: WP-M3-10
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/18-self-update.md §18.1, §18.5
spec-lines: 40

files-read:

- apps/agent/src/index.ts — the entry point of the agent
- apps/agent/src/server.ts — the HTTP server of the agent
- apps/agent/src/update-runner.ts — the three steps of a run
- apps/agent/src/token.ts — the bearer of the agent
- docker-compose.yml — the service `update-agent`
- Dockerfile — the target `agent`

files-write:

- apps/agent/package.json
- apps/agent/src/index.ts
- apps/agent/src/server.ts
- apps/agent/src/update-runner.ts

interfaces:

- the compose service `update-agent` — removed
- the target `agent` of the `Dockerfile` — removed
- `UPDATE_AGENT_URL`, `UPDATE_AGENT_TOKEN`, `UPDATE_AGENT_TOKEN_FILE` — removed
- the volume `update-state` — removed

## Task

The agent is replaced by the deploy webhook of ADR-0007, so its privileged
surface leaves the stack:

1. Delete the workspace `apps/agent` (the code, the tests, the package, the
   TypeScript and the Vitest configuration).
2. `Dockerfile`: the target `agent` and the packages of the agent are removed.
3. `docker-compose.yml`: the service `update-agent`, its profile, the volume
   `update-state` and the environment keys `UPDATE_AGENT_*` are removed; the
   `api` service loses the read-only mount of the state volume.
4. `.env.example`: the keys `UPDATE_AGENT_*` are removed.
5. The root `package-lock.json` is updated, so the workspace is gone.

## Non-goals

- The `update_runs` table stays: it is the history of the retired runs and no
  migration drops it.
- `scripts/update.sh` stays: it is the manual path of the operator
  (§18.7).
- No change of the database.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run check
docker compose config
```

Expected: all green; the compose file has no `update` profile any more and the
lock file knows no agent workspace.

## Handoff

- Files changed: the agent workspace, the `Dockerfile`, the compose file, the
  environment template, the lock file
- Interfaces added: none — interfaces are removed
- Verified: pending
- Follow-up WP: WP-M3-12 (the documentation)
- Open question: none
