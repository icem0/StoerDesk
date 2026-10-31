# WP-M2-02b: QR demo tokens and scheduled cleanup

format: small-model
status: planned
depends-on: WP-M2-02
phase: 2
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.2, specs/02-data-model.md §4.7
spec-lines: 25

files-read:

- specs/08-objects-api.md (§9.2 cleanup)
- specs/02-data-model.md (§4.7 `old_qr_tokens`)
- apps/api/src/objects/qr.ts (`generateQrToken`, table usage)
- apps/api/src/db/seed-demo.ts (idempotent demo seed)
- apps/api/src/index.ts (direct start, `onClose` hook)
- node_modules/pg-boss/README.md (v12 `createQueue`/`work`/`schedule`)

files-write:

- apps/api/src/db/seed-demo.ts
- apps/api/src/jobs/qr-cleanup.ts
- apps/api/src/index.ts

interfaces:

- `deleteExpiredQrTokens(database, now?): Promise<number>` — deletes
  `old_qr_tokens` rows with `expires_at <= now`
- `startQrTokenCleanup(connectionString): Promise<PgBoss>` — starts pg-boss,
  creates the `qr-token-cleanup` queue, registers the worker and the daily
  schedule, returns the boss for `stop()`
- demo objects receive a token; an existing demo object with `qr_token = NULL`
  is backfilled, an edited token is never overwritten

## Task

WP-M2-02 already resolves and retires tokens, but nothing deletes expired rows
and the demo seed still leaves `qr_token` NULL. This package closes both gaps.
It is intentionally separate: the parent stays inside the four-source-file
budget.

1. `apps/api/src/jobs/qr-cleanup.ts`: export `deleteExpiredQrTokens(database,
   now = new Date())` using Drizzle `delete(oldQrTokens).where(lte(expiresAt,
   now)).returning({ id })` and return the deleted count. It must be callable
   from a test without pg-boss.
2. Same file: `startQrTokenCleanup(connectionString)` constructs `new PgBoss({
   connectionString })`, logs errors through the returned instance (no PII),
   `start()`, `createQueue('qr-token-cleanup')`, `work()` opens a short-lived
   `createDatabase(connectionString)` per job, calls `deleteExpiredQrTokens` and
   closes the pool in `finally`, then `schedule('qr-token-cleanup', '0 3 * *
   *')` for one run per day. Export the queue name for tests.
3. `apps/api/src/index.ts`: in the direct-start block only, start the cleanup
   after the seeds and add an `app` `onClose` hook that stops pg-boss. Do not
   start it in `buildServer`, so integration tests never create the pg-boss
   schema.
4. `apps/api/src/db/seed-demo.ts`: when a demo object is inserted, set a
   generated `qr_token`; when an existing demo object has `qr_token = NULL`,
   fill it. Never touch a non-null token. Keep the seed idempotent and the edit
   guarantees of WP-M2-00.
5. Tests: extend `seedDemo.integration.spec.ts` to expect a unique
   22-character token per demo object and prove an edited token survives. Add
   `apps/api/src/jobs/__tests__/qr-cleanup.integration.spec.ts` for
   `deleteExpiredQrTokens`: expired rows are deleted, future rows survive.
   Both skip without a reachable database.

## Non-goals

- No change to the token format, the resolve route or the regenerate route.
- No pg-boss queue for notifications or escalation (their own phase).
- No sticker/PDF, no UI and no manual cleanup route.
- No schedule in `buildServer` and no job start during the test suite.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green against a reachable PostgreSQL 16; the cleanup spec proves
past rows disappear and future rows stay; `seedDemo` fills only NULL tokens.
`npm run dev` still starts the API and logs no job error.

## Handoff

- Files changed: the three source files, the two integration specs and the
  bookkeeping (`CHANGELOG.md`, `AGENTS.md`, `PLAN.md` §16, `docs/REPO-MAP.md`,
  `work-packages/README.md`)
- Interfaces added: `deleteExpiredQrTokens`, `startQrTokenCleanup`, queue name
- Verified: `npm run check` green, cleanup and seed specs pass on PostgreSQL 16
- Follow-up WP: WP-M2-03 (printable QR stickers) depends on WP-M2-02
