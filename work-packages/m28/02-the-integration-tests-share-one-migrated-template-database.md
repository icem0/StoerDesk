# WP-M28-02: the integration tests of the API share one migrated template database

format: ctx-256k
status: done
depends-on: —
phase: 28
milestone: m28
context-budget: 60k tokens
spec: PLAN.md §18.2 (the database of the integration tests)
spec-lines: 30
changed-lines: 601

files-read:

- apps/api/src/db/__tests__/helpers/testDatabase.ts (the database of a test file)
- apps/api/vitest.config.ts (the configuration of the API project)
- apps/api/src/db/migrate.ts (the migrations of the API)
- apps/api/src/db/schema.ts (the tables of the schema)
- apps/api/src/db/seed-rbac.ts (the seed of the RBAC catalog)
- apps/api/src/db/migrations/0054_ticket_without_object.sql (the reserved object)
- apps/api/src/config/env.ts (the environment of the API)

files-write:

- apps/api/src/db/__tests__/helpers/testDatabasePool.ts
- apps/api/src/db/__tests__/helpers/globalSetup.ts
- apps/api/src/db/__tests__/helpers/testDatabase.ts
- apps/api/src/db/__tests__/testDatabasePool.spec.ts
- apps/api/vitest.config.ts
- work-packages/m28/

interfaces:

- `createTestDatabasePool(options): Promise<{ pool, release }>` — the template, the clones and the leftovers
- `claimTestDatabase(pool): Promise<TestDatabaseClaim>` — the database of a file with the lock of the file
- `emptyTestDatabase(client, pool): Promise<void>` — the cleanup of a database
- `openTestDatabase(): Promise<TestDatabaseHandle>` — the database of a test file

## Task

Every one of the 128 integration files of the API built its own database: it
created one, applied all 63 migrations into it, seeded the RBAC catalog and
dropped it again. The drop alone cost about 440 ms and hardly runs in
parallel, so the housekeeping of the databases was half of the runtime of the
project.

1. **The template** `helpers/testDatabasePool.ts`: the global setup creates one
   database, applies the migrations into it and copies the rows the migrations
   wrote into the schema `test_pool` — the status catalog, the reserved object
   without an object, the counter of the ticket numbers. The template is
   closed before the clones are made, because PostgreSQL only clones a template
   without a session on it.
2. **The pool** `helpers/testDatabasePool.ts`: the global setup clones the
   template into one database per worker of the run and hands the pool to the
   files with `provide`. A file claims one of them with an advisory lock — the
   lock belongs to the session of the file and goes with it, so a file that
   dies gives its database back without a janitor.
3. **The cleanup** `helpers/testDatabasePool.ts`: a claimed database is empty
   before the file uses it. The rows go with a delete in the order of the
   foreign keys (a child before its parents, about 25 ms for the 44 tables);
   the tables with a trigger of their own — the append-only logs and the
   protected system roles — get their triggers switched off for the delete.
   The rows the migrations wrote come back from the copy in `test_pool`.
4. **The file** `helpers/testDatabase.ts`: `openTestDatabase()` claims a
   database of the pool. Without a pool — a file outside of Vitest or a
   database the global setup did not reach — it falls back to the old path.
5. **The leftovers**: the global setup removes the databases of the runs that
   died — the ones that are older than two hours. A database of a run that may
   still be going stays.
6. **The test** `db/__tests__/testDatabasePool.spec.ts` proves the schema of
   the claimed database, the rows the migrations wrote and the cleanup.

## Non-goals

- No change of a test of the API, no change of the migrations, no change of the
  schema.
- No change of the E2E — it builds its own throwaway database
  (`scripts/e2e-check.mjs`).
- No change of the pool of the web project — it has no database.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the API project needs less than 90 s with ten workers, and
every one of its cases stays green.

## Handoff

- Files changed: the pool, the global setup, the helper of the test files, the
  configuration of the API project and the test of the pool
- Interfaces added: `createTestDatabasePool`, `claimTestDatabase`,
  `emptyTestDatabase`, `TEST_DATABASE_POOL_KEY`
- Verified: the commands above
- Follow-up WP: **WP-M28-03** (the static gates of the check run in parallel)
- Open question: none
