# WP-M2-36: BMAcloud admin API and the scheduled sync job

format: small-model
status: implemented
depends-on: WP-M2-35
phase: 2
context-budget: 20k tokens
spec: specs/17-bmacloud-sync.md §17.5 (schedule, trigger, run history), §17.6; ADR-0003
(schedule, run log, guards)
spec-lines: 60

files-read:

- specs/17-bmacloud-sync.md §17.5
- apps/api/src/integrations/bmacloud/sync.ts — `syncBmaAnlagen` (WP-M2-35)
- apps/api/src/integrations/bmacloud/client.ts — `createBmaCloudClient` (WP-M2-33)
- apps/api/src/jobs/qr-cleanup.ts — the pg-boss queue/cron/`onClose` shape (WP-M2-02b)
- apps/api/src/admin/roles.ts — the `fp` plugin and permission-guard shape
- apps/api/src/index.ts — route registration and the direct-start-only job rule

files-write:

- apps/api/src/integrations/bmacloud/routes.ts
- apps/api/src/jobs/bma-sync.ts
- apps/api/src/index.ts
- packages/shared/src/schemas/bmacloud.ts

interfaces:

- `GET /api/v1/admin/bma-sync/runs?limit=` — guarded by `object.read`, the newest runs
  with their counters and conflicts, newest first
- `POST /api/v1/admin/bma-sync/run` — guarded by `object.import`, one synchronous
  `GET /anlagen` plus `syncBmaAnlagen`, answers the finished run
- `PATCH /api/v1/admin/bma-sync/schedule` — guarded by `object.write`, body
  `{ enabled: boolean, cron: string }`, stored as the `settings` rows `bma.sync.enabled`
  and `bma.sync.cron` (key/value table, `PLAN.md` §6), answers the stored pair
- `bmaSyncRunsQuerySchema`, `bmaSyncRunsResponseSchema`, `bmaSyncScheduleRequestSchema`,
  `bmaSyncScheduleResponseSchema` in the shared package
- `readBmaSyncSchedule(database, env)` — effective settings/env schedule pair
- `startBmaAnlageSync(connectionString, env, log?)` — pg-boss queue `bma-anlage-sync`,
  cron from the `bma.sync.cron` setting with `BMA_SYNC_CRON` as fallback; never started
  when `BMA_API_KEY` is empty; each job opens its own short-lived pool

## Task

1. `packages/shared/src/schemas/bmacloud.ts`: add the run-summary, runs-list and schedule
   schemas and re-export them from `schemas/index.ts`.
2. `routes.ts`: an `fp` plugin `bmaSyncRoutes` taking `{ database, env }`; every error is
   `{ code, params }` (`bma_not_configured`, `bma_request_failed`, `bma_bad_response`,
   `invalid_request`) — never a translated message, never the API key.
3. Read the schedule override from `settings`, fall back to
   `BMA_SYNC_ENABLED` / `BMA_SYNC_CRON`.
4. `apps/api/src/jobs/bma-sync.ts` follows `qr-cleanup.ts`: `start` → `createQueue` →
   `work` → `schedule`, one pool per job, `boss.on('error')` logs only message and stack.
5. Register the plugin in `index.ts` and start the job **only** from the direct API start,
   stopped by the existing `onClose` hook — `buildServer()` and the test suite must never
   create the pg-boss schema.
6. Test `apps/api/src/integrations/bmacloud/__tests__/routes.integration.spec.ts`:
   anonymous `401`, missing permission `403`, `POST …/run` without an API key answers
   `409 { code: 'bma_not_configured' }` and writes no run row, `PATCH …/schedule` stores
   and re-reads the pair, `GET …/runs` lists newest first.

## Non-goals

- No admin page (WP-M2-37) and no i18n key in this WP.
- No new permission key (ADR-0003).
- No retry chain or notification on a failed run — the outbox worker is phase 7.
- No background retry of a failed pull: pg-boss keeps the schedule, that is all.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the integration spec really runs (reachable database required,
otherwise report it as unverified). No test starts pg-boss.

## Handoff

- Files changed: the four source files above, the integration spec, `docs/REPO-MAP.md`,
  `work-packages/README.md`, `PLAN.md` and `CHANGELOG.md`
- Interfaces added: `bmaSyncRoutes`, `readBmaSyncSchedule`, `startBmaAnlageSync`,
  `BMA_ANLAGE_SYNC_QUEUE`, the three `/api/v1/admin/bma-sync/*` routes and the
  run-history/schedule shared schemas
- Verified: `npm run check` locally (typecheck, lint, 288 tests, i18n, wp:check; the
  E2E gate skipped: no usable Chromium); the reachable-DB integration spec runs 20 tests
  in the BMAcloud folder.
- Follow-up WP: WP-M2-37 (admin page), WP-M2-38 (its card on the administration home)
- Open question: WP-M2-37 needs the current schedule for its form prefill, but §17.5 and
  this WP define no `GET /api/v1/admin/bma-sync/schedule`.
