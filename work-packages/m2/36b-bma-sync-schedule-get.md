# WP-M2-36b: read the BMAcloud sync schedule for the admin page

format: small-model
status: implemented
depends-on: WP-M2-36
phase: 2
context-budget: 12k tokens
spec: specs/17-bmacloud-sync.md §17.5 (schedule and trigger), ADR-0003
spec-lines: 25

files-read:

- apps/api/src/integrations/bmacloud/routes.ts — `readBmaSyncSchedule` and the schedule
  `PATCH` of WP-M2-36
- apps/api/src/integrations/bmacloud/**tests**/routes.integration.spec.ts — the guard and
  schedule tests of WP-M2-36
- packages/shared/src/schemas/bmacloud.ts — `bmaSyncScheduleResponseSchema`

files-write:

- apps/api/src/integrations/bmacloud/routes.ts
- specs/17-bmacloud-sync.md

interfaces:

- `GET /api/v1/admin/bma-sync/schedule` — guarded by `object.read`, answers the **effective**
  schedule pair `{ enabled, cron }` through `readBmaSyncSchedule`: the stored `settings` rows
  `bma.sync.enabled` / `bma.sync.cron` when present and well-typed, otherwise the
  environment pair `BMA_SYNC_ENABLED` / `BMA_SYNC_CRON`
- no new shared schema: the answer is the existing `bmaSyncScheduleResponseSchema`

## Task

1. Close the open question of WP-M2-36: the admin page of WP-M2-37 prefills its schedule
   form, so the stored or effective pair has to be readable. Add the `GET` route next to the
   existing `PATCH` in `routes.ts` and reuse `readBmaSyncSchedule(database, env)` unchanged.
2. Guard it with `PERMISSIONS.object.read` — the same guard as the run history; ADR-0003 adds
   no new permission key.
3. Answer `bmaSyncScheduleResponseSchema.parse(...)`; no error branch is needed, so the route
   never carries an API key or a `settings` value other than the cron text.
4. Extend `specs/17-bmacloud-sync.md` §17.5 with the fourth admin route, so the spec names
   every route the page uses.
5. Test in the existing integration spec: anonymous `401`, `reporter_internal` reads `200`,
   the answer is the environment pair while nothing is stored, and after a `PATCH` the `GET`
   answers the stored pair.

## Non-goals

- No admin page (WP-M2-37) and no i18n key in this WP.
- No new schedule semantics: the storage, the fallback and the cron shape stay exactly as
  WP-M2-36 defines them.
- No `DELETE` of the settings rows — disabling is done with `enabled: false`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the BMAcloud integration spec runs against a reachable database
(otherwise it is reported as unverified, never as green).

## Handoff

- Files changed: `routes.ts`, the integration spec, `specs/17-bmacloud-sync.md`,
  `docs/REPO-MAP.md`, `work-packages/README.md`, `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: `GET /api/v1/admin/bma-sync/schedule`
- Verified: `npm run check` locally (typecheck, lint, 289 tests, i18n parity, wp:check; the
  E2E gate skipped: no usable Chromium); the BMAcloud folder runs 21 tests, the extended
  routes spec 7 of them, against a reachable throwaway database.
- Follow-up WP: WP-M2-37 (`37-bma-sync-admin-page.md`) — it prefills from this route
- Open question: none — the WP-M2-36 question is closed by this route
