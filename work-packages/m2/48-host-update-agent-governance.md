# WP-M2-48: host update agent — decision, spec and work plan

format: small-model
status: implemented
depends-on: WP-M2-43
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4–§18.6 (new), PLAN.md §16/§19
spec-lines: 130

files-read:

- docs/DECISIONS/0004-self-update-model.md — the accepted stage-2 model
- specs/18-self-update.md — the stage-2 contract as planned
- docker-compose.yml, Dockerfile — the stack the agent belongs to
- docs/DEPLOYMENT.md — deployment is a host checkout + compose build
- packages/shared/src/permissions.ts — the permission catalog
- apps/api/src/db/schema.ts — the `bma_sync_runs` pattern for `update_runs`

files-write:

- docs/DECISIONS/0006-host-update-agent.md
- specs/18-self-update.md
- work-packages/m2/48-host-update-agent-governance.md
- work-packages/m2/49-*.md … work-packages/m2/56-*.md — the child work packages

interfaces:

- decision record ADR-0006: the host update agent is a service of the same
  compose project behind the profile `update`, mounted with the checkout and
  the Docker socket, reachable only on the internal network
- contract owner: `specs/18-self-update.md` §18.4 (topology, run steps),
  §18.5 (security), §18.6 (agent protocol)

## Task

1. Write ADR-0006: how stage 2 runs `git pull` → `docker compose up -d --build`
   → `docker image prune -f` on the host without giving the `api` container any
   host access, and how the agent survives the redeploy it triggers (compose
   profile, same project, same network, same `.env`).
2. Concretize `specs/18-self-update.md`: §18.4 with the topology, the mounts,
   the three run steps and the ownership restore; §18.6 with the agent protocol
   (`GET /status`, `POST /run`, `GET /runs`), the run state file and the
   reconciliation rule of the `update_runs` row.
3. Create this WP and the child WPs `WP-M2-49` … `WP-M2-56`, so the follow-ups
   have files and not only sentences:
   - 49 shared contracts (`system.update`, update schemas, RBAC spec)
   - 50 database (`update_runs` table, migration `0009`)
   - 51 agent service core (new workspace `apps/agent`, the run logic, tests)
   - 52 agent HTTP server (`GET /status`, `POST /run`, `GET /runs`)
   - 53 agent image, compose service and env wiring
   - 53b the compose invocation of the agent and its image in the smoke test
   - 54 admin API (`/api/v1/admin/update/*`, agent client, reconciliation)
   - 55 admin UI (host update section on `/admin/update`, i18n)
   - 56 documentation (deployment, repository map, changelog, plan backlog)
4. Bookkeeping in the same commit: `docs/DECISIONS.md` index row,
   `work-packages/README.md` backlog rows, `PLAN.md` §16 backlog, `CHANGELOG.md`.

## Non-goals

- No code, service, route, table or migration in this WP — governance only.
- No change of ADR-0004: the stage-2 model itself (out-of-band agent, no OS
  password) stays as accepted; ADR-0006 only fixes the topology.
- No update-availability network check (§18.3 stays optional and unplanned).

## Acceptance

```bash
npm run wp:check
npm run i18n:check
```

Expected: wp:check reports the eight new small-model WPs green; i18n unchanged
(this WP writes no locale file).

## Handoff

- Files changed: ADR-0006, the spec slice and the eight WP documents; plus the
  bookkeeping files named in task 4.
- Interfaces added: ADR-0006, `specs/18-self-update.md` §18.4/§18.6.
- Verified: `npm run wp:check` green, i18n untouched.
- Follow-up WP: WP-M2-49 (shared contracts) — file created in this commit, then
  WP-M2-50 … WP-M2-55 in numeric order.
- Open question: none.
