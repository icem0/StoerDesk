# WP-M27-01: the sticker is a template

format: ctx-256k
status: done
depends-on: —
phase: 27
milestone: m27
context-budget: 24k tokens
spec: specs/08-objects-api.md §9.3, PLAN.md §11 (printable stickers), PLAN.md §16 (phase 27)
spec-lines: 140
changed-lines: 240

files-read:

- PLAN.md (§11 printable stickers, §16 phase roadmap and the current state)
- specs/08-objects-api.md (§9.1 object list query, §9.3 printable stickers)
- docs/DECISIONS.md (the index of the decisions)
- docs/DECISIONS/0048-the-alarm-of-the-instance.md (the shape of a decision)
- apps/web/src/features/objects/sticker-page.tsx (the print view of today)
- apps/web/src/styles.css (the print classes of today)
- packages/shared/src/schemas/object.ts (`objectListQuerySchema`, `objectSummarySchema`)
- apps/api/src/settings/branding.ts (the settings row of the branding)
- apps/api/src/objects/service.ts (`whereFromQuery` — the filters of the list)
- apps/web/src/settings/settings-page.tsx (the sections of the settings)
- work-packages/README.md (the backlog of record)
- scripts/wp-check.mjs (the limits of the profile)

files-write:

- specs/08-objects-api.md
- docs/DECISIONS/0050-the-sticker-is-a-template.md
- docs/DECISIONS.md
- PLAN.md
- work-packages/README.md
- work-packages/m27/01-the-sticker-is-a-template.md

interfaces:

- ADR-0050 — the sticker is a template: a geometry and an appearance of the installation
- `StickerGeometry` — the sheet format, the grid, the label size, the margins and the gaps
- `StickerAppearance` — the error correction and the size of the QR, the printed lines
- `StickerTemplate` — the geometry and the appearance with the key of the catalog
- `GET|PUT /api/v1/settings/sticker-template` — the template of the installation

## Task

The office labels its objects with the stickers of a label roll and asked for
three things: the sheet formats of an A4 label sheet, the look of the sticker as a
setting, and a proper filter for the list of the objects to print. The print view
of WP-M2-03 knows two formats (A6 and A4 with four A6 cards), draws the QR with
hard-coded parameters and filters the list with one free-text field over three
fields. This package writes the **decision and the spec**; the code follows in
WP-M27-02 … WP-M27-06.

1. **The ADR** `docs/DECISIONS/0050-the-sticker-is-a-template.md`: the sticker is
   a template of the installation — a *geometry* (sheet format, columns, rows,
   label size, margins, distance between the labels) and an *appearance* (error
   correction and size of the QR, the lines that are printed). The template is the
   settings row `sticker.template`; the catalog of the sheets is data, not a
   branch in the code; every geometry must fit on its sheet; the sheet is printed
   in blocks of `columns × rows` labels per page; the 112 notice is not part of
   the appearance and stays visible on every sticker; the QR stays the public URL
   with the token and belongs to the object, not to the template.
2. **The spec** `specs/08-objects-api.md` §9.3: the geometry and the appearance
   with their fields, the catalog of the presets (`a6`, `a4-2x2`, `a4-21`,
   `a4-52`, `a4-104`, `custom`), the rule that a geometry must fit on its sheet,
   the two routes of the template with their permissions, the content of the
   sticker in its order and the print in blocks.
3. **The plan** `PLAN.md`: §11 names the template, the catalog, the print in
   blocks and the server-side filter of the list; §16 gains the row of phase 27
   with its exit criteria and the paragraph that opens the phase.
4. **The bookkeeping** `work-packages/README.md`: the row of phase 27 in the table
   of the phases and the six rows of the phase in the backlog of record
   (WP-M27-01 in progress, WP-M27-02 … WP-M27-06 planned without a file yet).

## Non-goals

- No code in this package: the contracts, the route, the administration, the
  print view and the filter are WP-M27-02 … WP-M27-05.
- No PDF endpoint, no server-side rendering (`PLAN.md` §4, §11).
- No logo and no company name on the sticker.
- No copies per object.
- No change of the object list API and no new query parameter.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `npm run wp:check` accepts this package (the profile
`ctx-256k`, 6 write files, 12 read files, 140 spec lines, 240 changed lines).

## Handoff

- Files changed: the six files above
- Interfaces added: the decision ADR-0050, the model of the template in the spec
- Verified: `npm run check` green; the spec names a model that the packages
  WP-M27-02 … WP-M27-05 implement without a further decision
- Follow-up WP: WP-M27-02 (the contracts and the route), WP-M27-03 (the
  administration of the template), WP-M27-04 (the sheet from the geometry),
  WP-M27-05 (the filter of the list) and WP-M27-06 (the criterion of the phase)
- Open question: the measures of the presets are proposals for the label roll of
  the office; the roll of the office decides the numbers, and the free grid takes
  every other measure over without a new version of the app
