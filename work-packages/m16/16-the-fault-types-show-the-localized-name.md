# WP-M16-16: the fault types show the localized name

format: small-model
status: planned
depends-on: WP-M16-15
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.8; ADR-0043; specs/06-report-form.md §7.9
spec-lines: 30

files-read:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/text-template-form-parts.tsx (the fields of the translation)
- apps/web/src/admin/__tests__/text-templates-page.test.tsx
- apps/web/src/components/row-menu.tsx (the shared menu of the row)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/text-templates-page.tsx
- apps/web/src/admin/__tests__/text-templates-page.test.tsx
- apps/web/src/i18n/locales/de/settings.json and apps/web/src/i18n/locales/en/settings.json

interfaces:

- the table of `/admin/text-templates`: the columns „Name“ (the name of the set
  language), „Status“, „Verwendung“ and the row menu — the columns „Key“, „DE“
  and „EN“ are gone
- the edit of a fault type: the key as a read-only field beside the two
  translation fields
- `admin.textTemplates.table.name` — the header of the name column

## Task

1. The table of `TextTemplatesPage` shows one name per row:
   `localizedName(template.translations, i18n.language, template.key)`. The
   columns `table.key`, `table.de` and `table.en` are gone, `table.name` is the
   new header. The key stays the tooltip of the name cell.
2. The actions of the row move into the shared `RowMenu`: „Bearbeiten“ opens the
   edit, „Archivieren“/„Wieder aktivieren“ toggles the archive, „Löschen“
   deletes. The list itself carries no action button any more. The blocked
   delete keeps its reason as the tooltip of its item.
3. The edit form (`EditTemplateForm`) shows the key as a read-only field above
   the two translation fields, so the key and every translation stand together.
4. The keys of the table in `settings.json` (de and en) follow: `table.name`
   instead of `table.key`, `table.de` and `table.en`.
5. The test proves: the table shows the German name in the German interface and
   the English name in the English one, the key is not a column of the table,
   the row menu carries the three actions and the edit shows the key.

## Non-goals

- No change of the API, of the archive rule and of the delete guard
  (`409 text_template_in_use`).
- No change of the create page (`/admin/text-templates/new`) — it writes the key
  of a new fault type and stays as it is.
- No change of the report form and of the office form: they read the catalog and
  show the name of their locale already.
- No change of the usage count.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the new test fails before the change (the table shows three
columns of names) and passes after it.

## Handoff

- Files changed: the three entries of `files-write`
- Interfaces added: `admin.textTemplates.table.name`; the columns and the edit
  of the page carry the rule of ADR-0043
- Verified: the commands above
- Follow-up WP: WP-M16-17, WP-M16-18, WP-M16-19, WP-M16-20a, WP-M16-20b,
  WP-M16-20c, WP-M16-20d (each file exists in the commit of the split)
- Open question: none
