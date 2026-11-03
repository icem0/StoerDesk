# WP-M2-37: BMAcloud sync page in the administration

format: small-model
status: implemented
depends-on: WP-M2-36, WP-M2-36b
phase: 2
context-budget: 18k tokens
spec: specs/17-bmacloud-sync.md §17.5 (admin UI page), PLAN.md §14 (settings)
spec-lines: 30

files-read:

- specs/17-bmacloud-sync.md §17.5
- apps/api/src/integrations/bmacloud/routes.ts — the three routes of WP-M2-36
- apps/web/src/settings/branding-page.tsx — the admin page and settings-menu pattern
- apps/web/src/admin/users-page.tsx — permission guard, error mapping, back link
- packages/shared/src/schemas/bmacloud.ts — the response schemas

files-write:

- apps/web/src/admin/bma-sync-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `BmaSyncPage` at the guarded route `/admin/bma-sync` inside `RequireSession`
- `useBmaSyncRuns()` → `GET /v1/admin/bma-sync/runs`, `useRunBmaSync()` →
  `POST /v1/admin/bma-sync/run`, `useBmaSyncSchedule()` →
  `GET /v1/admin/bma-sync/schedule` (prefill, exists since WP-M2-36b) and
  `PATCH /v1/admin/bma-sync/schedule`
- i18n keys `settings:admin.bma.*` — title, hint, back link label reuse of
  `settings:admin.back`, table headers, `runNow`, `running`, `enabled`, `cron`, `save`,
  the four `errors.*` codes and the four run status labels

## Task

1. `bma-sync-page.tsx`: the back link to `/admin`, the heading, the schedule form
   (enabled checkbox plus cron text input, prefilled from the `GET` of WP-M2-36b) and the
   "Jetzt abgleichen" button; the button is disabled while the request runs and shows
   `admin.bma.running`.
2. The run table lists the newest runs: started, finished, status badge carrying the
   localized label (never colour alone) and the five counters.
3. Below it the conflicts of the newest run as a table
   (`code`, `objectNo`, `aid`, `detail`); an empty array renders `admin.bma.noConflicts`.
4. Errors map the `{ code, params }` of the server to `admin.bma.errors.<code>` for
   `bma_not_configured`, `bma_request_failed`, `bma_bad_response`, `invalid_request` —
   no literal UI string anywhere (`i18next/no-literal-string`).
5. Register `/admin/bma-sync` in `apps/web/src/routes/index.tsx` next to the other admin
   routes; the page renders its own notice when `/me` answers `401`.

## Non-goals

- No card on the administration home (WP-M2-38) and no badge in the object list
  (WP-M2-39).
- No live progress of a running pull — the trigger is synchronous.
- No retention control for old runs.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; de and en carry the same key set (`i18n:check` parity).

## Handoff

- Files changed: the four files above plus the page test
  `apps/web/src/admin/__tests__/bma-sync-page.test.tsx`, `docs/REPO-MAP.md`,
  `work-packages/README.md`, `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: `BmaSyncPage` and its components `ScheduleForm`, `RunTable`,
  `ConflictTable`, `StatusBadge`, the route `/admin/bma-sync`, the `settings:admin.bma.*`
  keys (title, hint, loading, notices, runNow, running, save, saved, scheduleTitle,
  scheduleHint, enabled, cron, runsTitle, conflictsTitle, noRuns, noConflicts, noDetail,
  notFinished, `table.*`, `conflicts.*`, the four `status.*` labels and `errors.*`)
- Verified: `npm run check` locally (typecheck, lint with no new warning, 294 tests, 507 de
  and 507 en keys, wp:check; the E2E gate skipped: no usable Chromium); the page test adds
  five tests covering the prefill, the status label and conflicts, the empty conflict table,
  the `bma_not_configured` hint of the trigger, the disabled trigger without `object.import`
  and the session notice.
- Follow-up WP: WP-M2-38 (card on the administration home) and WP-M2-39 (external badge in
  the object list) — both files exist since the WP-M2-32 record commit
- Open question: none — the schedule prefill is answered by WP-M2-36b
