# ADR-0050: The sticker is a template — a geometry and an appearance of the installation

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, administration

## Context

The printable QR stickers came with WP-M2-03. The implementation is a print view
of the browser: `StickerPage` at `/objects/stickers` renders an A6 card of
105 × 148 mm per object, the sheet knows two formats (A6 — one card per page,
A4 — four cards per page) and the QR is drawn with hard-coded parameters
(error correction `M`, a margin of two modules, 256 px, a 55 mm square in the
card). The list is a checklist with one free-text field over object number,
name and city.

The office labels its objects with adhesive labels from a **label roll**, not
with A6 cards: the sheet carries a grid of small labels — 21, 64 or 104 labels
per A4 — and every roll has its own label size, its own margins and its own
distance between the labels. The print view of today cannot express such a
sheet: the card is always 105 × 148 mm and always holds a 55 mm QR, the text
always has the same size, and the sheet always cuts a 2 × 2 grid. A label of
25.7 × 20.7 mm would carry a QR that is bigger than the label.

The office asked for three things:

- **the sheet formats of an A4 label roll** shall be available,
- **the look of the sticker** shall be a setting — the size of the QR, the
  error correction, the lines that are printed,
- **the list of the objects to print** shall be filtered properly.

## Decision

1. **A sticker is a template of the installation**: a **geometry** and an
   **appearance**. The geometry names the sheet format (`a4` or `a6`), the
   columns, the rows, the label size, the margins of the sheet and the distance
   between two labels. The appearance names the error correction of the QR
   (`L`, `M`, `Q`, `H`), the size of the QR in millimetres (`null` = automatic,
   a share of the label height) and the lines that are printed (object name,
   object number, report call).
2. **The template is a setting of the installation**, stored in the settings row
   `sticker.template` and edited in the administration under „Objekte“ next to
   the stickers (`/admin/sticker-template`). Every printer of the office prints
   the same sticker; the print job chooses the sheet, not the look.
3. **The catalog is data, not a branch in the code.** The presets are `a6` (one
   A6 label per page), `a4-2x2` (four A6 labels per A4 page — the format of
   today), `a4-21`, `a4-64`, `a4-104` (label sheets of an A4 with 21, 64 or 104
   labels) and `custom` (a free grid). The numbers of the presets are
   proposals for the label roll of the office; the administration may take a
   preset over into the free grid and adjust it.
4. **Every geometry must fit on its sheet.** The width of the grid
   (`columns * labelWidthMm + (columns - 1) * gapXMm` plus the two side
   margins) may not exceed the width of the sheet, the rows the same way with
   the height. A geometry that does not fit answers `400 invalid_request` with
   the field path — the print view never writes a label over the edge of the
   page.
5. **The sheet is printed in blocks.** The print view writes the labels in
   blocks of `columns × rows` labels per page; a block has the exact height of
   the sheet and ends with a page break, so the grid of the label roll is kept
   and the browser does not distribute the labels on its own. The browser print
   stays the primary path (`PLAN.md` §4, §11); there is still no PDF endpoint.
6. **The 112 notice is not part of the appearance.** It stays on every printed
   sticker and cannot be switched off (`PLAN.md` §2, `AGENTS.md`).
7. **The QR of the sticker is not part of the template.** It encodes the public
   URL with the token of the object and nothing else (§9.2 of
   `specs/08-objects-api.md`); the tokens belong to the objects, not to the
   template.
8. **The list of the objects to print is filtered on the server** with the
   query of the object list (`search`, `active`, `city`), and the checklist can
   be selected completely or not at all.

## Alternatives

- **A PDF endpoint on the server.** Rejected for now: `PLAN.md` §4 and §11
  decide that the browser print is the primary path, and a PDF would not solve
  the request — the missing thing is the label geometry, not a file format.
- **The template in the `localStorage` of the browser.** Rejected: the sticker
  of the office is one sticker. A template in one browser means two printers
  of the same office print different sheets.
- **The presets as named brand templates (Avery L7160, Zweckform 3475 …).**
  Rejected: the names carry no geometry without a datasheet, and the office
  prints the roll it has, not the roll of a brand. The numbers of the presets
  are proposals and the free grid carries the truth.
- **A configurable 112 notice.** Rejected: the notice is the emergency rule of
  `PLAN.md` §2 and stays visible on every sticker.
- **One card size for every sheet.** Rejected: a 25.7 mm label cannot hold a
  55 mm QR; the size of the QR follows the size of the label.

## Consequences

- The settings table carries one more row; there is **no migration** — the row
  is a JSON value like the branding of ADR-0036.
- The administration owns a page for the template; the print view reads it and
  falls back to the default template (A4, 2 × 2 A6) when the row is missing or
  malformed.
- The print view no longer owns a card size: the card reads its size from the
  geometry, and the text sizes scale with the label.
- The presets are a proposal. If the label roll of the office has other
  measures, the free grid carries them without a new version of the app.
