# WP-M15-04: the administration edits the duty windows

format: small-model
status: done
depends-on: WP-M15-03
phase: 15
milestone: m15
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.1, §4a.3.2
spec-lines: 60

files-read:

- apps/web/src/admin/oncall-page.tsx (the form of the eight keys)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the settings)
- apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/__tests__/ticket-defaults-page.test.tsx (the pattern of an admin test)
- specs/04-oncall.md (§4a.1, §4a.3.2)

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/__tests__/oncall-page.test.tsx

interfaces:

- a row per weekday in the settings of the readiness: a switch, a start and an end
- `oncall.admin.settings.windows.*` — the texts of the block in de and en
- the body of `PUT /api/v1/settings/oncall` carries `oncall.weekly_windows`

## Task

1. `apps/web/src/admin/oncall-page.tsx` gains the block „Dienstfenster" below
   the eight keys: one row per weekday (Monday first, Sunday last) with a
   switch, a start and an end. A row without the switch is a free day and
   stays out of the body. A new row starts at the start time of the settings
   and ends at 17:00.
2. The block states the plan: with at least one window the fields „Wochenstart",
   „Startzeit" and „Dauer in Tagen" are disabled and a hint names that they do
   not apply to the window plan. Without a window they stay editable and the
   continuous plan of ADR-0011 stands.
3. The save writes the windows with `oncall.weekly_windows` next to the eight
   keys and reads them back into the form. The form keeps the values of the
   disabled fields, so removing the windows brings the continuous plan back.
4. The texts come from the `oncall` namespace in `de` and `en`: the title of the
   block, the hint of the plan, the labels of the two times. The admin test
   proves the seven rows, the disabled continuous fields with a window, the
   body of the save and the names of the two time fields.

## Non-goals

- No new page: the block belongs to the card „Bereitschafts-Einstellungen" of
  `/admin/oncall`.
- No change of the calendar, of the grid and of the pool list.
- No validation of the start against the end of the previous day.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/admin/oncall-page.tsx`, the two locale files,
  the admin test file
- Interfaces added: the block and the texts above
- Verified: the commands above
- Follow-up WP: WP-M15-05 (the exit criterion) — the file exists in the commit
  of the split
- Open question: none
