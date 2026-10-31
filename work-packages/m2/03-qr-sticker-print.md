# WP-M2-03: Printable QR sticker sheets

format: small-model
status: implemented
depends-on: WP-M2-01, WP-M2-02, WP-M2-02b
phase: 2
context-budget: 22k tokens
spec: specs/08-objects-api.md §9.3, PLAN.md §2 (112 notice), PLAN.md §11 (stickers)
spec-lines: 34

files-read:

- specs/08-objects-api.md (§9.1 object list, §9.3 printable stickers)
- PLAN.md (§2 emergency notice, §4 sticker stack decision, §11 sticker rules)
- packages/shared/src/schemas/object.ts (`ObjectSummary`, `ObjectListResponse`)
- apps/web/src/routes/index.tsx (guarded route table)
- apps/web/src/components/Shell.tsx (nav items, header/main chrome)
- apps/web/src/lib/api.ts (`apiFetch`, `ApiError`)

files-write:

- apps/web/src/features/objects/sticker-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/styles.css

interfaces:

- `StickerPage` at route `/objects/stickers` (child of the `RequireSession` route):
  checklist of active objects from `GET /v1/objects?active=true`, every object
  selected by default, client-side search over number/name/city, format select
  `a6`/`a4`, print button
- `StickerCard` — QR of `<origin>/m/<qr_token>` (`qrcode.react`, SVG), object name,
  object number, `object:sticker.reportCall`, `object:sticker.emergencyNotice`, and
  `object:sticker.noToken` instead of a QR when the token is `NULL`
- print CSS in `apps/web/src/styles.css`: `.sticker-sheet`, `.sticker-sheet--a6`,
  `.sticker-sheet--a4`, `.sticker-card` (105 × 148 mm, `break-inside: avoid`); the
  chosen format injects exactly one `@page` rule (`size`, `margin`)
- shell nav entry `common:auth.links.stickers`; header, nav and toolbar are
  `print:hidden`
- no new API route, no schema, no migration — the PDF idea of the legacy plan is dropped

## Deviation from the legacy plan

The legacy `03-qr-pdf.md` promised `GET /api/v1/objects/:id/qr.pdf` via `pdf-lib`.
`PLAN.md` §4 and §11 decide the opposite: the browser print view with `@media print`
and A6/A4 page sizes is the primary path, and a real PDF download is optional and only
added with its own work package if a deployment needs one. `PLAN.md` is the anchor, so
this package implements the print view and no PDF endpoint.

## Task

1. `apps/web/src/features/objects/sticker-page.tsx`: `StickerPage` loads
   `apiFetch<ObjectListResponse>('/v1/objects?active=true')` through TanStack Query
   (key `['objects', 'stickers']`). A search input filters the checklist client-side
   over `objectNo`, `name` and `city`; the checklist starts fully selected and stores
   only the exceptions. A `<select>` switches the format between `a6` and `a4`, and
   the print button calls `window.print()` and is disabled while nothing is selected
   or the list is loading.
2. Same file: `StickerCard` renders the sticker per §9.3 — `QRCodeSVG` with
   `value = \`${window.location.origin}/m/${object.qrToken}\``, then name, object
   number, `reportCall` and the 112 notice. `qrToken === null` renders `noToken` and
   no QR. Every user-facing string comes from the `object` namespace.
3. Same file: the sheet renders one `@page` style per format (`size: 105mm 148mm` plus
   `margin: 0` for A6, `size: A4` plus `margin: 8mm` for A4) and the card grid of the
   selected format.
4. `apps/web/src/styles.css`: the sticker classes with millimetre sizes for screen and
   print, black on white, `break-inside: avoid` for cards, white `body` background in
   `@media print`, and an A6 card one millimetre shorter than the page box so the
   rounding of a `148 mm` card cannot add an empty page.
5. `apps/web/src/routes/index.tsx`: register `/objects/stickers` as a guarded child;
   `apps/web/src/components/Shell.tsx`: add the nav entry and mark header, nav, the
   heading, the toolbar and the checklist `print:hidden` (plus `print:p-0`,
   `print:max-w-none`, `print:overflow-visible`), so only the sheet reaches the paper.
6. Test (fixture, excluded from the file budget):
   `apps/web/src/features/objects/__tests__/sticker-page.test.tsx` — stubs
   `/v1/objects`, asserts the object number and name are on the sheet, the German 112
   notice appears, an `<svg>` QR is rendered per selected object, an object with
   `qrToken: null` shows `noToken` and no QR, and deselecting an object removes its
   card.

## Non-goals

- No PDF endpoint, no `pdf-lib`, no server-side rendering (PLAN.md §4/§11).
- No new API route, no shared schema change, no migration.
- No sticker for inactive objects, no CSV import, no object detail page.
- No copies-per-object control and no sheet preview pagination.

## Acceptance
```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new spec fails before the component exists and passes after.
Manual check in a browser: `/objects/stickers` prints an A4 sheet with four A6 cards
per page and an A6 sheet with one card per page, and every card carries the 112 notice.

## Handoff

- Files changed: the four source files above, the new spec, the `object` and `common`
  locale fixtures (de and en), `apps/web/package.json` (dependency `qrcode.react`), the
  test and the bookkeeping (`CHANGELOG.md`, `AGENTS.md`, `PLAN.md` §16,
  `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: `StickerPage`, `StickerCard`, the sticker print classes, one nav entry
- Verified: `npm run check` green (typecheck, lint, web and API tests, i18n, wp-check,
  Playwright smoke on a throwaway database with `E2E_CHROMIUM_PATH`); the new spec covers
  the card list, the QR/no-token split, search plus deselect and the `@page` rule; a
  throwaway Playwright probe (not committed) signed in, created five objects and printed:
  header, nav, toolbar and checklist compute to `display: none`, every card is 105 × 148 mm
  with a 55 mm QR and the 112 notice inside the card, the A4 sheet produced two pages of
  210 × 297 mm (four cards on the first), the A6 sheet exactly one 105 × 148 mm page per
  object
- Follow-up WP: none — a real PDF download stays optional per `PLAN.md` §4/§11 and only
  gets its own WP when a deployment asks for it, so nothing is announced here
- Open question: none
