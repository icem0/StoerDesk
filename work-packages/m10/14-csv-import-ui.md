# WP-M10-14: CSV import page

format: small-model
status: planned
depends-on: WP-M10-13
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.4
spec-lines: 80

files-read:

- specs/08-objects-api.md (§9.4)
- apps/web/src/features/objects or the current object list page
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/de.ts or the active locale module

files-write:

- apps/web/src/features/objects/object-import-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/de.ts
- apps/web/src/i18n/en.ts

interfaces:

- `ObjectImportPage` at `/objects/import`
- file input, mapping controls, preview table, summary and commit action

## Task

1. Build the page: read the file in the browser, post the text, show the header
   mapping, preview rows/summary and the commit action.
2. Show row errors inline and keep the page usable without `object.import`
   (read-only notice).
3. Add the route and a link from the object list.
4. Add German and English strings.

## Non-goals

- No server-side file upload.
- No import history.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a component test covers file text, preview, mapping and the
commit summary.

## Handoff

- Files changed: the page, the route and both locales
- Interfaces added: `ObjectImportPage`
- Verified: the commands above
- Follow-up WP: WP-M10-15
- Open question: none
