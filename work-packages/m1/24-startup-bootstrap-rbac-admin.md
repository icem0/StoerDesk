# WP-M1-24: RBAC and administrator bootstrap on API start (retroactive record)

format: small-model
status: done (retroactive record — implemented in commit 71fd066, 2026-10-30, without a WP)
depends-on: WP-M1-05, WP-M1-06
phase: 1
context-budget: 12k tokens
spec: PLAN.md §18.2 (seeds are idempotent and ordered), §16 phase 1 exit criterion
"login as admin works"
spec-lines: 20

files-read:

- apps/api/src/index.ts
- apps/api/src/db/seed-rbac.ts
- apps/api/src/db/seed-base.ts
- docs/DEPLOYMENT.md

files-write:

- apps/api/src/index.ts

interfaces:

- the direct start of `apps/api/src/index.ts` (the `invokedDirectly` branch) runs
  `seedRbac(database)` and `seedBaseUser(database, { email, password })` against a
  short-lived pool before `buildServer()`; `buildServer()` itself stays seed-free, so
  tests and `buildServer` never touch the seed path.

## Task

This document does **not** describe new work. It records what commit `71fd066`
(`fix(api): bootstrap RBAC and admin user on API server start`) changed, so that no
phase 1 commit is left without a work package.

1. A fresh deployment had no usable administrator until a person ran the seeds by hand,
   so the phase 1 exit criterion "login as admin works" failed on a clean stack.
2. The direct start of the API now seeds the permission catalog, the five system roles
   and the bootstrap administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
   before it listens — both seeds are idempotent, so a restart is a no-op.
3. The pool used for seeding is closed before the server starts; the seed output never
   contains an e-mail or a password.

## Non-goals

- No migration change — migrations still run separately (`PLAN.md` §18.2).
- No seeding inside `buildServer()` — the test suite must not write seed rows.
- No demo seed (`seed-demo.ts` is WP-M2-00, phase 2).

## Acceptance

The acceptance of the original commit, as it is gated today:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: green; on a fresh database the API start leaves one active administrator with
the role `admin`.

## Handoff

- Files changed: `apps/api/src/index.ts` (one file, inside `PLAN.md` §17)
- Interfaces added: none public; the start-up side effect is described above and is
  recorded in `docs/REPO-MAP.md` on the row of `apps/api/src/index.ts`
- Verified: the `check` job runs the integration tests against PostgreSQL 16
  (WP-M1-25); the E2E of WP-M1-12 signs in as the seeded administrator
- Deviation: the commit landed before this record existed and named no WP; the seed
  regression of commit `82a9fc7` that followed it is recorded and repaired in WP-M1-14
- Follow-up WP: none — WP-M1-12 proves the login, WP-M1-14 repaired the seed
- Open question: none
