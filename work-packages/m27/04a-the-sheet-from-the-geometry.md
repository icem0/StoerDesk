# WP-M27-04a: the sheet from the geometry

format: ctx-256k
status: done
depends-on: WP-M27-03
phase: 27
milestone: m27
context-budget: 40k tokens
spec: specs/08-objects-api.md §9.3, ADR-0050
spec-lines: 140
changed-lines: 560

files-read:

- specs/08-objects-api.md §9.3 (the print in blocks)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- packages/shared/src/schemas/sticker.ts (the contracts and the catalog)
- apps/web/src/features/objects/sticker-page.tsx (the card of today)
- apps/web/src/styles.css (the print classes of today)
- apps/web/src/features/objects/__tests__/sticker-page.test.tsx (the harness of the page test)
- apps/web/src/i18n/locales/de/object.json (the texts of the namespace `object`)
- work-packages/README.md (the backlog of record)

files-write:

- apps/web/src/features/objects/sticker-sheet.tsx
- apps/web/src/styles.css
- packages/shared/src/schemas/sticker.ts
- apps/web/src/features/objects/__tests__/sticker-sheet.test.tsx
- work-packages/m27/04a-the-sheet-from-the-geometry.md
- work-packages/m27/04b-the-page-prints-the-chosen-sheet.md
- work-packages/README.md

interfaces:

- `StickerSheet({ template, objects })` — the sheet of the stickers in the blocks of the grid
- `stickerQrSizeMm(geometry, appearance)` — the side of the QR in millimetres (the shared contract of the automatic size)
- `.sticker-sheet`, `.sticker-page`, `.sticker-label` and their parts — the print classes of the sheet

## Task

The page of WP-M2-03 renders a card of 105 × 148 mm and knows two formats; a
label of 25,7 × 20,7 mm has no place for such a card. The sheet of this package
knows no format of its own — the geometry of the template writes its measures
into the sheet.

1. **The component** `apps/web/src/features/objects/sticker-sheet.tsx`: it takes
   the template and the objects and writes
   - the `@page` rule of the sheet format (`A4` or `105mm 148mm`, always with
     the margin `0`),
   - the measures of the geometry into the custom properties of the sheet
     (the width of the sheet, the columns, the rows, the width and the height of
     the label, the two distances, the four margins, the size of the QR, the
     padding of the label and the four font sizes),
   - the labels in blocks of `columns × rows` labels — one block per page of the
     sheet, so the grid of the label roll survives the print dialog,
   - the label itself: the QR of the public URL with the token (never the object
     number), the name, the object number and the report call as far as the
     appearance prints them, and **always** the 112 notice.
2. **The size of the QR** `stickerQrSizeMm(geometry, appearance)` — a contract of
   the appearance in the shared package: the stored size, or — when the template
   says „automatisch" — the smaller of the free width of the label (its width
   less four millimetres) and 45 % of its height. The QR of a small label is
   therefore small and the QR of an A6 card is big.
3. **The font sizes** follow the height of the label: the name 4 %, the object
   number 2,7 %, the report call 3,4 % and the notice 2,3 % of the height — the
   A6 card of today keeps its measures.
4. **The print classes** in `apps/web/src/styles.css`: `.sticker-sheet` holds
   the blocks, `.sticker-page` is the grid of one page with the margins of the
   sheet as its padding and a page break after it (the last block without one),
   `.sticker-label` is the label with the dashed cut line. In the print media
   the label is half a millimetre shorter than the sheet, so a label of exactly
   the height of the page (the A6 sheet of one label) cannot add an empty page.
5. **The test** `apps/web/src/features/objects/__tests__/sticker-sheet.test.tsx`:
   one label per object with the QR, the lines and the 112 notice, the measures
   of the geometry in the custom properties, the page rule of the sheet format,
   the blocks of the grid, the lines that the appearance switches off and the
   size of the QR.

## Non-goals

- No page and no filter — the page that uses the sheet is WP-M27-04b.
- No preview of the sheet in the administration — the preview arrives with
  WP-M27-04b.
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

Expected: all green; the new test of the sheet fails before the component
exists and passes after it.

## Handoff

- Files changed: the six files above
- Interfaces added: `StickerSheet`, `stickerQrSizeMm` and the print classes of
  the sheet
- Verified: `npm run check` green (typecheck, lint, the tests of the web and the
  API, i18n, wp-check, the Playwright smoke on a throwaway database); the test
  of the sheet shows the labels, the measures in the custom properties, the page
  rule, the blocks of the grid and the appearance
- Follow-up WP: WP-M27-04b (the page prints the chosen sheet), WP-M27-05 (the
  filter of the list) and WP-M27-06 (the criterion of the phase)
- Open question: none
