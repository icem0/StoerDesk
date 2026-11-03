# WP-M2-66: the object list shows the system type

format: small-model
status: implemented
depends-on: WP-M2-64, WP-M2-65
phase: 2
context-budget: 12k tokens
spec: specs/17-bmacloud-sync.md §17.3, specs/13-ui.md (object list)
spec-lines: 40

files-read:

- apps/web/src/features/objects/object-list-page.tsx — the list and its badges (WP-M2-01)
- packages/shared/src/schemas/bmacloud.ts — `externalTypeCategory()` (WP-M2-65)
- apps/web/src/i18n/locales/de/object.json — the list keys
- apps/web/src/i18n/locales/en/object.json — the list keys
- apps/web/src/features/objects/__tests__/object-list-page.test.tsx — the list test

files-write:

- apps/web/src/features/objects/object-list-page.tsx — the `Typ` column
- apps/web/src/i18n/locales/de/object.json — `list.columns.type`
- apps/web/src/i18n/locales/en/object.json — `list.columns.type`
- apps/web/src/features/objects/__tests__/object-list-page.test.tsx — the new column

interfaces:

- the object list table gains a `Typ` column: the derived category badge
  (`BMA`, `RWA`, `LICHTRUF`, `EMA`, `SPRACHALARM` — via `externalTypeCategory`) plus the
  raw `externalType` name as the cell title; an object without `externalType` renders `—`

## Task

1. Add the `Typ` column header (key `list.columns.type`, de „Typ", en „Type") to
   `object-list-page.tsx` between `Name` and the address block.
2. The cell renders `externalTypeCategory(object.externalType, …)` as a quiet badge using
   the existing `systemChips` visual style and, on hover, the full `externalType` name;
   no category and no name renders `—`.
3. Extend the list test: an object with `externalType: 'Brandmeldeanlage Notifier'` shows
   the `BMA` badge and the title; a local object shows `—`.

## Non-goals

- No type filter in the list query.
- No type field in the create/edit forms (the value belongs to BMAcloud).
- No sticker or report-form use of the type.

## Acceptance

```bash
npm run check
```

Expected: all green; i18n:check reports equal de/en keys including `list.columns.type`.

## Handoff

- Files changed: the list page, the `list.columns.type` key in `de`/`en` object.json, the list
  test plus `CHANGELOG.md`, `work-packages/README.md` and `docs/REPO-MAP.md`.
- Interfaces added: the `Typ` column of the object list table; no new shared export
  is used beyond `externalTypeCategory()` (WP-M2-65).
- Verified: `npm run check` green with `E2E_CHROMIUM_PATH=/usr/bin/chromium` — typecheck, lint,
  62 Vitest files, i18n:check (595 keys in de and en), wp:check and the Playwright
  e2e suite.
- Note: an `externalType` the keyword table does not classify renders its stored name as
  the badge text instead of an empty badge; the local object shows the em dash.
- Follow-up WP: none.
- Open question: none.
