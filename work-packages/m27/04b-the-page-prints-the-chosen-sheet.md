# WP-M27-04b: the page prints the chosen sheet

format: ctx-256k
status: planned
depends-on: WP-M27-04a
phase: 27
milestone: m27
context-budget: 40k tokens
spec: specs/08-objects-api.md §9.3, ADR-0050
spec-lines: 140
changed-lines: 460

files-read:

- specs/08-objects-api.md §9.3 (the route, the template and the print)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- packages/shared/src/schemas/sticker.ts (the contracts and the catalog)
- apps/web/src/features/objects/sticker-sheet.tsx (the sheet of WP-M27-04a)
- apps/web/src/features/objects/sticker-page.tsx (the page of today)
- apps/web/src/features/objects/__tests__/sticker-page.test.tsx (the test of the page)
- apps/web/src/settings/sticker-template-page.tsx (the administration of the template)
- apps/web/src/i18n/locales/de/object.json (the texts of the namespace `object`)
- work-packages/README.md (the backlog of record)

files-write:

- apps/web/src/features/objects/sticker-page.tsx
- apps/web/src/features/objects/__tests__/sticker-page.test.tsx
- apps/web/src/settings/sticker-template-page.tsx
- apps/web/src/i18n/locales/de/object.json, apps/web/src/i18n/locales/en/object.json
- work-packages/m27/04b-the-page-prints-the-chosen-sheet.md

interfaces:

- `StickerPage` at `/objects/stickers` — the checklist of the objects and the sheet of the chosen format
- `GET /api/v1/settings/sticker-template` — the look of the sticker of the installation
- `common:stickerTemplate.preset.*` — the names of the sheets of the catalog

## Task

The sheet of WP-M27-04a is ready; this package puts it into the page of the
stickers and lets the printer choose the sheet of the job — the look stays the
setting of the installation.

1. **The page** `apps/web/src/features/objects/sticker-page.tsx`: it reads the
   template of the installation with
   `GET /api/v1/settings/sticker-template` and renders the sheet with
   `StickerSheet`. The select of the toolbar offers the sheets of the catalog
   (`a6`, `a4-2x2`, `a4-21`, `a4-52`, `a4-104`) and the free grid of the
   installation; the chosen sheet decides the geometry, the appearance of the
   template decides the look of every label.
2. **The texts** in `apps/web/src/i18n/locales/de/object.json` and
   `.../en/object.json`: the label of the select of the sheet, the hint that the
   look is decided in the administration and the link to it.
3. **The preview of the administration**: the page of the template shows the
   sheet of the current form with the labels of the grid, so the printer sees
   the grid before he prints it.
4. **The test** `apps/web/src/features/objects/__tests__/sticker-page.test.tsx`:
   the page shows the labels of the sheet of the installation, the select of the
   sheet changes the geometry of the sheet, the look of the installation is
   used, and the checklist of the objects still works.

## Non-goals

- No server-side filter of the list — WP-M27-05.
- No PDF endpoint and no change of the API.
- No logo on the sticker and no copies per object.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the page fails before the change and passes
after it.

## Handoff

- Files changed: the five files above
- Interfaces added: the select of the sheet and the preview of the administration
- Verified: `npm run check` green
- Follow-up WP: WP-M27-05 (the filter of the list) and WP-M27-06 (the criterion
  of the phase)
- Open question: none
