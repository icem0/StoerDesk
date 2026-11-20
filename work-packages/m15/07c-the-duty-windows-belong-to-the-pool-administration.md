# WP-M15-07c: the duty windows belong to the pool — the administration

format: small-model
status: done
depends-on: WP-M15-07b
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.1, §4a.2, §4a.3.2
spec-lines: 40

files-read:

- apps/web/src/admin/oncall-page.tsx (the settings card and the window block)
- apps/web/src/i18n/locales/de/oncall.json (the German texts)
- apps/web/src/i18n/locales/en/oncall.json (the English texts)
- apps/web/src/admin/**tests**/oncall-page.test.tsx (the page test)

files-write:

- apps/web/src/admin/oncall-page.tsx
- apps/web/src/i18n/locales/de/oncall.json
- apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/admin/**tests**/oncall-page.test.tsx

interfaces:

- the block „Dienstzeiten je Pool" with a pool selector and seven weekday rows
- the save writes `PATCH /api/v1/oncall/pools/:id` with `weeklyWindows`
- the global settings keep the continuous plan and lose the window block
- the „Standard-Pool" is labelled as the pool for ticket offers and the
  dashboard tile, with a hint that it carries no duty times

## Task

1. The window block leaves the card „Bereitschafts-Einstellungen"; the week
   start, the start time and the duration stay editable as the global fallback.
2. A new block „Dienstzeiten je Pool" selects a pool and edits its seven
   weekday windows; a pool without windows says that the continuous plan
   applies. The editor is keyed by the pool so a switch resets it.
3. The default pool field is renamed and carries a hint that it only picks the
   pool for ticket offers and the dashboard tile.

## Non-goals

- No new page and no change of the calendar, the grid or the pool list.
- No validation of a start against the end of the previous day.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
```

Expected: green; the page test drives the weekday rows and the pool `PATCH`.

## Handoff

- Files changed: the page, both locale files and the page test
- Interfaces added: the block and the texts above
- Verified: typecheck, lint, `i18n:check` and the unit suite
- Follow-up WP: WP-M15-07d — the file exists in this commit
- Open question: none
