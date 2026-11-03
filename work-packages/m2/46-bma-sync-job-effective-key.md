# WP-M2-46: the scheduled BMAcloud pull reads the effective bearer key

format: small-model
status: planned
depends-on: WP-M2-45, ADR-0005
phase: 2
context-budget: 14k tokens
spec: specs/17-bmacloud-sync.md §17.5 (credentials), ADR-0005
spec-lines: 30

files-read:

- apps/api/src/jobs/bma-sync.ts — the start guard on `BMA_API_KEY` and the key use in the worker
- apps/api/src/integrations/bmacloud/routes.ts — `readBmaApiKey`, `readBmaSyncSchedule`,
  `BMA_API_KEY_SETTING` (WP-M2-45)
- apps/api/src/jobs/qr-cleanup.ts — the pg-boss job shape this file follows
- apps/api/src/db/client.ts — `createDatabase` per job run
- apps/api/src/jobs/**tests**/qr-cleanup.integration.spec.ts — the throwaway-database pattern
  a job test uses

files-write:

- apps/api/src/jobs/bma-sync.ts
- apps/api/src/jobs/**tests**/bma-sync-job.integration.spec.ts

interfaces:

- `startBmaAnlageSync(connectionString, env, log?)` — unchanged signature; it now refuses to
  schedule only when **both** the `bma.api.key` row and `BMA_API_KEY` are empty, and the
  worker resolves the key per run
- no new export

## Task

1. Move the credential decision of `startBmaAnlageSync` from the environment check into
   the existing startup read: one pool reads `readBmaSyncSchedule` **and**
   `readBmaApiKey(database, env)`; disabled schedule → no job, empty effective key →
   log `BMA sync job disabled: neither bma.api.key nor BMA_API_KEY is set` and return
   `undefined`.
2. In the worker resolve the key per run with `await readBmaApiKey(database, env)` and
   hand it to `createBmaCloudClient`, so a key stored or deleted on the admin page takes
   effect without an API restart. An empty key then surfaces as the client error
   `bma_not_configured` in the failure log.
3. Never log the key: the log lines stay limited to the queue name, the cron, the run
   counters and the fixed error code.
4. New integration spec on the throwaway database: `startBmaAnlageSync` answers
   `undefined` with no key at all and with `bma.sync.enabled = false`, and it schedules
   (returns a `PgBoss` that `stop()` closes) when the `settings` row `bma.api.key` holds a
   key while `BMA_API_KEY` is empty.

## Non-goals

- No UI and no i18n key — **WP-M2-47** (`47-bma-sync-api-key-field-ui.md`).
- No rescheduling when the admin changes the cron at runtime: the schedule is still read
  once at API start (WP-M2-36); only the key is read per run.
- No change of the client, the sync service or the run log.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new job spec runs against a reachable database (otherwise it is
reported as unverified, never as green).

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M2-47 (`47-bma-sync-api-key-field-ui.md`)
- Open question: none
