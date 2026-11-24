# WP-M27-03: the administration of the sticker template

format: ctx-256k
status: done
depends-on: WP-M27-02
phase: 27
milestone: m27
context-budget: 44k tokens
spec: specs/08-objects-api.md §9.3, ADR-0050, PLAN.md §11 (printable stickers)
spec-lines: 140
changed-lines: 640

files-read:

- specs/08-objects-api.md §9.3 (the model of the template)
- docs/DECISIONS/0050-the-sticker-is-a-template.md (the decision)
- packages/shared/src/schemas/sticker.ts (the contracts and the catalog)
- apps/api/src/settings/sticker-template.ts (the route)
- apps/web/src/settings/branding-page.tsx (the page of a setting of the instance)
- apps/web/src/settings/settings-page.tsx (the sections of the settings menu)
- apps/web/src/routes/index.tsx (the guarded routes)
- apps/web/src/auth/usePermission.ts (`usePermission`)
- apps/web/src/settings/__tests__/branding-page.test.tsx (the harness of a page test)
- apps/web/src/i18n/locales/de/common.json (the texts of the namespace `common`)
- work-packages/README.md (the backlog of record)

files-write:

- apps/web/src/settings/sticker-template-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/sticker-template-page.test.tsx
- work-packages/m27/03-the-administration-of-the-template.md

interfaces:

- `StickerTemplatePage` at `/admin/sticker-template` — the geometry and the look of the sticker of the installation
- `common:stickerTemplate.*` — the texts of the page
- `common:auth.links.stickerTemplate` — the entry of the settings menu under „Objekte“

## Task

The route of WP-M27-02 stores the template; this package writes the page that
edits it. The page is a setting of the installation and belongs next to the
stickers in the settings menu.

1. **The page** `apps/web/src/settings/sticker-template-page.tsx`: it reads
   `GET /api/v1/settings/sticker-template` and writes
   `PUT /api/v1/settings/sticker-template`. The form carries two fieldsets:
   - **„Blatt und Raster“** — the sheet of the catalog (`a6`, `a4-2x2`, `a4-21`,
     `a4-52`, `a4-104`, free grid), the sheet format (A4 or A6), the columns,
     the rows, the width and the height of the label, the four margins and the
     two distances between the labels;
   - **„Aussehen des Aufklebers“** — the error correction of the QR
     (`L`/`M`/`Q`/`H`), the size of the QR (a field or „automatisch“) and the
     three switches of the printed lines (name, object number, report call).
   Choosing a preset takes its geometry over into the form; the free grid keeps
   the stored geometry.
2. **The rule of the fit** in the page: `stickerGeometryOverflow` (the shared
   contract of WP-M27-02) names a grid that does not fit on its sheet — the
   page shows the hint and the save button stays disabled. The server refuses
   the same grid with `400 invalid_request` and the field path.
3. **The permission**: the page reads the template with `object.read` and writes
   it with `settings.write`; the fields are disabled without the permission.
4. **The route** `/admin/sticker-template` in `apps/web/src/routes/index.tsx`
   behind the `RequireSession` guard, and the entry
   `common:auth.links.stickerTemplate` in the group „Objekte“ of the settings
   menu, next to the stickers.
5. **The texts** in `apps/web/src/i18n/locales/de/common.json` and
   `.../en/common.json`: the title, the hint, the two fieldsets, the fields of
   the geometry and of the look, the names of the sheets of the catalog, the
   four error corrections and the errors. The hint of the 112 notice says that
   the line stands on every sticker and cannot be switched off — the appearance
   has no switch for it.
6. **The test** `apps/web/src/settings/__tests__/sticker-template-page.test.tsx`:
   the page shows the stored geometry and the look, a chosen preset takes its
   geometry over and is saved, a grid of eight columns of 63,5 mm is refused and
   the save button stays disabled, and the page names the 112 notice as a line
   that cannot be switched off.

## Non-goals

- No preview of the sheet — the sheet of the print view arrives with WP-M27-04.
- No logo and no company name on the sticker.
- No copies per object and no PDF endpoint.
- No change of the route of WP-M27-02 and no migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new page test fails before the page exists and passes
after it.

## Handoff

- Files changed: the six files above
- Interfaces added: `StickerTemplatePage`, the route `/admin/sticker-template`,
  the entry of the settings menu and the texts `common:stickerTemplate.*`
- Verified: `npm run check` green (typecheck, lint, the tests of the web and the
  API, i18n, wp-check, the Playwright smoke on a throwaway database); the page
  test reads the stored template, takes the geometry of a preset over, saves it
  and refuses a grid that does not fit on the sheet
- Follow-up WP: WP-M27-04 (the sheet from the geometry, with the preview of the
  administration), WP-M27-05 (the filter of the list) and WP-M27-06 (the
  criterion of the phase)
- Open question: none
