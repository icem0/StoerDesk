# WP-M27-02: the contracts of the sticker template and the route

format: ctx-256k
status: done
depends-on: WP-M27-01
phase: 27
milestone: m27
context-budget: 40k tokens
spec: specs/08-objects-api.md §9.3, ADR-0050
spec-lines: 140
changed-lines: 680

files-read:

- specs/08-objects-api.md §9.3 (the model of the template)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- packages/shared/src/schemas/object.ts (the schemas of the object list)
- packages/shared/src/schemas/settings.ts (the schemas of the settings rows)
- packages/shared/src/permissions.ts (`object.read`, `settings.write`)
- packages/shared/src/__tests__/ticketDefaults.test.ts (the style of a contract test)
- apps/api/src/settings/branding.ts (the settings row of the branding)
- apps/api/src/settings/text-templates.ts (`fieldPaths`, the error of a route)
- apps/api/src/settings/__tests__/branding.integration.spec.ts (the harness of a route test)
- apps/api/src/index.ts (the registration of the routes)
- apps/api/src/db/schema.ts (the `settings` table)
- work-packages/README.md (the backlog of record)

files-write:

- packages/shared/src/schemas/sticker.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/settings/sticker-template.ts
- apps/api/src/index.ts
- packages/shared/src/__tests__/sticker.test.ts
- apps/api/src/settings/__tests__/sticker-template.integration.spec.ts
- work-packages/m27/02-the-contracts-and-the-route.md

interfaces:

- `stickerGeometrySchema` — the sheet format, the grid, the label size, the margins and the gaps
- `stickerAppearanceSchema` — the error correction and the size of the QR, the printed lines
- `stickerTemplateSchema` — the geometry and the appearance with the key of the catalog
- `STICKER_TEMPLATE_PRESETS` — the catalog: `a6`, `a4-2x2`, `a4-21`, `a4-52`, `a4-104`
- `stickerGeometryOverflow(geometry)` — the fields of a geometry that do not fit on the sheet
- `stickerPresetKeyOf(geometry)` — the key of the catalog of a geometry
- `DEFAULT_STICKER_TEMPLATE` — the template of an installation that configured nothing
- `GET /api/v1/settings/sticker-template` — the template of the installation (`object.read`)
- `PUT /api/v1/settings/sticker-template` — the write of the template (`settings.write`)

## Task

The decision and the spec of WP-M27-01 name the model of the template; this
package writes the contracts and the route. The row of the settings table is
the storage — the branding of ADR-0036 is the pattern, no migration.

1. **The contracts** `packages/shared/src/schemas/sticker.ts`: the geometry
   (sheet format, columns, rows, label size, the four margins, the two gaps),
   the appearance (error correction `L`/`M`/`Q`/`H`, the size of the QR or
   `null` for automatic, the three switches of the printed lines), the template
   and the response of the route. `STICKER_SHEET_SIZE_MM` holds the measures of
   the sheet formats (A4 210 × 297 mm, A6 105 × 148 mm).
2. **The rule of the fit** `stickerGeometryOverflow(geometry)`: the width of the
   grid (`columns * labelWidthMm + (columns - 1) * gapXMm` plus the two side
   margins) may not exceed the width of the sheet, the rows the same way with
   the height. The function answers the path of the field that does not fit
   (`geometry.columns`, `geometry.rows`), and `stickerTemplateSchema` refuses
   such a template — the answer of the API names the field as well.
3. **The catalog** `STICKER_TEMPLATE_PRESETS`: `a6` (one A6 label per page),
   `a4-2x2` (four A6 labels per A4 page — the format of today), `a4-21`
   (63,5 × 38,1 mm), `a4-52` (38,1 × 21,2 mm) and `a4-104` (25,7 × 20,7 mm).
   Every preset fits on its sheet; the test of the catalog says so.
   `stickerPresetKeyOf(geometry)` names the preset of a geometry and `custom`
   when no preset matches.
4. **The route** `apps/api/src/settings/sticker-template.ts`: the settings row
   `sticker.template` holds `{ templateKey, geometry, appearance }`.
   `GET` (`object.read`) answers the template and the default of the server when
   the row is missing or malformed. `PUT` (`settings.write`) parses the body,
   keeps every stored value that the body does not name, takes the geometry of a
   preset over when the body names a preset and no geometry, lets the geometry
   decide the key of the catalog, refuses a body that is malformed and a grid
   that does not fit with `400 invalid_request` and the field path, and answers
   the stored template.
5. **The registration** in `apps/api/src/index.ts`.
6. **The tests**: `packages/shared/src/__tests__/sticker.test.ts` (every preset
   fits, the overflow names the columns and the rows, the key follows the
   geometry) and `apps/api/src/settings/__tests__/sticker-template.integration.spec.ts`
   (401 without a session, 403 without `settings.write`, the default template,
   the preset over the write, the appearance alone keeps the geometry, the free
   grid, the grid that does not fit).

## Non-goals

- No administration page and no print view — WP-M27-03 and WP-M27-04.
- No migration: the row is a JSON value in the existing `settings` table.
- No PDF endpoint and no change of the object list API.
- No logo on the sticker and no copies per object.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new contract test and the new integration test fail
before the change and pass after it.

## Handoff

- Files changed: the seven files above
- Interfaces added: the contracts of the template, the catalog, the rule of the
  fit, the settings row `sticker.template` and its two routes
- Verified: `npm run check` green (typecheck, lint, the tests of the web and the
  API, i18n, wp-check, the Playwright smoke on a throwaway database); the
  integration test reads the default template, stores a preset, keeps the
  stored geometry when only the appearance is written, names the free grid and
  refuses a grid of eight columns of 63,5 mm on an A4
- Follow-up WP: WP-M27-03 (the administration of the template), WP-M27-04 (the
  sheet from the geometry), WP-M27-05 (the filter of the list) and WP-M27-06
  (the criterion of the phase)
- Open question: the measures of the presets are proposals for the label roll of
  the office; the free grid takes every other measure over
