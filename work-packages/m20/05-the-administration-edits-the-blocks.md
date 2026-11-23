# WP-M20-05: the administration edits the blocks

format: small-model
status: done
depends-on: WP-M20-04
phase: 20
milestone: m20
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.3.3
spec-lines: 30

files-read:

- apps/web/src/admin/oncall-page.tsx (the rows of the blocks of WP-M20-04)
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/**tests**/oncall-page.test.tsx

interfaces:

- block rows: from weekday, to weekday, start, end, add and remove
- the presets „Verwaltung“ (Mo–Do 07:00–17:00, Fr 07:00–12:00) and „Technik
  rund um die Uhr“ (Mo–So 00:00–24:00)
- texts in `oncall` (de and en) for the block rows

## Task

1. Add the button that adds a block and the button that removes a row.
2. Add the two presets: „Verwaltung“ and „Technik rund um die Uhr“.
3. Add the texts of the rows in both languages.
4. Test: two office blocks are saved, the body carries `from_weekday` and
   `to_weekday`, and the preset fills the rows.

## Non-goals

- No new page, no change of the calendar (`/oncall`).
- No change of the API.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change.

## Handoff

- Files changed: the page, the two locales, the page test
- Interfaces added: the block rows and their texts
- Verified: the commands above
- Follow-up WP: WP-M20-06
- Open question: none
