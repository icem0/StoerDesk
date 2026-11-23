# WP-M16-18: the ticket statuses show the localized name

format: small-model
status: planned
depends-on: WP-M16-17
phase: 16
milestone: m16
context-budget: 15k tokens
spec: specs/13-ui.md §14.8; ADR-0043; specs/07-escalation.md §7.9
spec-lines: 30

files-read:

- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/status-form.tsx
- apps/web/src/admin/__tests__/status-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/status-page.tsx
- apps/web/src/admin/status-form.tsx
- apps/web/src/admin/__tests__/status-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json and apps/web/src/i18n/locales/en/settings.json

interfaces:

- the table of `/admin/statuses`: the columns „Name“ (the name of the set
  language), „Farbe“, „Position“, „Aktiv“, „Endstatus“, „Tickets“ and the row
  menu — the columns „Key“, „Name (DE)“ and „Name (EN)“ are gone
- the edit of a status: the key as a read-only field beside the two name fields
- `admin.status.table.name` — the header of the name column

## Task

1. The table of `StatusPage` shows one name per row:
   `localizedName(languageRecord({ de: row.nameDe, en: row.nameEn }),
   i18n.language, row.key)`. The columns `table.key`, `table.nameDe` and
   `table.nameEn` are gone, `table.name` is the new header. The key stays the
   tooltip of the name cell.
2. The actions of the row move into the shared `RowMenu`: „Bearbeiten“ opens the
   edit, „Löschen“ asks for the confirmation (the `removeCandidate` of the page
   stays). The list itself carries no action button any more.
3. `StatusForm` shows the key of an edited status as a read-only field above the
   two name fields — the key of an existing status is immutable.
4. The keys of the table in `settings.json` (de and en) follow: `table.name`
   instead of `table.key`, `table.nameDe` and `table.nameEn`.
5. The test proves: the table shows the German name in the German interface and
   the English name in the English one, the key is not a column of the table,
   the row menu carries the two actions and the edit shows the key read-only.

## Non-goals

- No change of the API, of the guards (`409 status_in_use`,
  `409 status_last_active`, `409 status_key_taken`) and of the ticket count.
- No change of the create page (`/admin/statuses/new`).
- No change of the workflow and of the transitions.
- No change of the ticket list, which shows the status of a ticket in the
  language of the interface already.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the four entries of `files-write`
- Interfaces added: `admin.status.table.name`
- Verified: the commands above
- Follow-up WP: WP-M16-19, WP-M16-20a, WP-M16-20b, WP-M16-20c, WP-M16-20d
  (each file exists in the commit of the split)
- Open question: none
