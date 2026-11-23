# WP-M16-17: the detected errors show the localized name

format: small-model
status: done
depends-on: WP-M16-16
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.8; ADR-0043; specs/13-detected-errors.md §13.5
spec-lines: 25

files-read:

- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/detected-error-form-parts.tsx
- apps/web/src/admin/__tests__/detected-errors-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/detected-errors-page.tsx
- apps/web/src/admin/__tests__/detected-errors-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json and apps/web/src/i18n/locales/en/settings.json

interfaces:

- the table of `/admin/detected-errors`: the columns „Name“ (the name of the set
  language), „Status“, „Verwendung“ and the row menu — the columns „Key“, „DE“
  and „EN“ are gone
- the edit of a detected error: the key beside the two labels
- `detectedErrors.table.name` — the header of the name column

## Task

1. The table of `DetectedErrorsPage` shows one name per row:
   `localizedName(languageRecord({ de: item.labelDe, en: item.labelEn }),
   i18n.language, item.key)`. The columns `table.key`, `table.de` and `table.en`
   are gone, `table.name` is the new header. The key stays the tooltip of the
   name cell.
2. The actions of the row move into the shared `RowMenu`: „Bearbeiten“ opens the
   edit, „Archivieren“/„Wieder aktivieren“ toggles the archive, „Löschen“
   deletes. The blocked delete (an archived entry) keeps its reason as the
   tooltip of its item and no longer as a line of its own.
3. The edit form (`EditErrorForm`) keeps the key field (the API allows a rename)
   beside the two label fields — the key and every translation stand together.
4. The keys of the table in `settings.json` (de and en) follow: `table.name`
   instead of `table.key`, `table.de` and `table.en`.
5. The test proves: the table shows the German label in the German interface and
   the English label in the English one, the key is not a column of the table,
   the row menu carries the three actions and the edit shows the key.

## Non-goals

- No change of the API, of the archive rule and of the delete guard
  (`409 detected_error_in_use`).
- No change of the create page (`/admin/detected-errors/new`).
- No change of the ticket detail, which shows the detected errors of a ticket.
- No change of the statistics by detected error.

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

- Files changed: the three entries of `files-write`
- Interfaces added: `detectedErrors.table.name`
- Verified: the commands above
- Follow-up WP: WP-M16-18, WP-M16-19, WP-M16-20a, WP-M16-20b, WP-M16-20c,
  WP-M16-20d (each file exists in the commit of the split)
- Open question: none
