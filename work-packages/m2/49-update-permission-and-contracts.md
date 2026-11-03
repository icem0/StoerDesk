# WP-M2-49: shared contracts for the host update

format: small-model
status: planned
depends-on: WP-M2-48
phase: 2
context-budget: 14k tokens
spec: specs/18-self-update.md §18.4–§18.6, specs/01-rbac.md §3.3
spec-lines: 130

files-read:

- packages/shared/src/permissions.ts — the permission catalog and role matrix
- packages/shared/src/schemas/index.ts — the schema barrel
- packages/shared/src/schemas/bma.ts — the schema style to copy
- specs/01-rbac.md — §3.3 matrix and the key total
- apps/api/src/db/seed-rbac.ts — the seed reads `PERMISSION_KEYS`
- apps/api/src/auth/requirePermission.ts — the only enforcement point

files-write:

- packages/shared/src/permissions.ts
- packages/shared/src/schemas/update.ts
- packages/shared/src/schemas/index.ts
- specs/01-rbac.md

interfaces:

- permission key `system.update` (group `system`), granted to the role `admin`
  only
- schemas `updateStatusSchema`, `updateRunSchema`, `updateRunsSchema`,
  `agentStatusSchema`, `agentRunSchema` in `@stoerdesk/shared`

## Task

1. Add the permission key `system.update` to `PERMISSIONS` (new group
   `system`), append it to `PERMISSION_KEYS` and give it to the role `admin` in
   `DEFAULT_ROLES`. No other role gets it.
2. Create `packages/shared/src/schemas/update.ts` with the Zod schemas of the
   update contract:
   - `updateRunSchema`: `{ id, status: 'RUNNING'|'SUCCESS'|'PARTIAL'|'FAILED',
     startedAt, finishedAt?, beforeVersion?, afterVersion?, errorCode? }`
   - `updateStatusSchema`: `{ agent: { reachable, version? }, running, lastRun?,
     currentVersion? }`
   - `updateRunsSchema`: `{ runs: updateRunSchema[] }`
   - `agentStatusSchema` and `agentRunSchema`: what the agent answers
     (`{ state, checkout: { version, commit? }, lastRun? }`), so the API
     validates every agent answer.
3. Export the new schemas from `packages/shared/src/schemas/index.ts`.
4. Update `specs/01-rbac.md` §3.3: the new key in the matrix (admin only) and
   the new total of the permission keys.

## Non-goals

- No API route, no agent, no table, no UI (WP-M2-50 … WP-M2-54).
- No new role, no change of an existing role's permissions.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the RBAC spec lists
the new key; the seed inserts it on the next API start (the seed upserts
`PERMISSION_KEYS`, no migration needed).

## Handoff

- Files changed: the four files of `files-write`.
- Interfaces added: `system.update`, the update schemas.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-50 (the `update_runs` table).
- Open question: none.
