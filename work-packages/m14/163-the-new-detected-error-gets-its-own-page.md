# WP-M14-163: the new detected error gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/13-detected-errors.md §13.5; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-162

files-read:

- apps/web/src/admin/detected-errors-page.tsx (the list and the inline create form)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the detected errors)
- specs/13-detected-errors.md (§13.5 the admin catalog)
- docs/REPO-MAP.md (the module of the detected errors page)
- work-packages/m14/162-the-new-fault-type-gets-its-own-page.md (the pattern)

files-write:

- apps/web/src/admin/detected-error-form-parts.tsx, apps/web/src/admin/detected-error-create-page.tsx
- apps/web/src/admin/detected-errors-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/detected-error-create-page.test.tsx
- work-packages/m14/163-the-new-detected-error-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `DetectedErrorCreatePage` — the own page of the new detected error at
  `/admin/detected-errors/new`
- `detected-error-form-parts.tsx` — `errorMessage`, `jsonHeaders` — the parts
  that the list and the create page share
- `/admin/detected-errors/new` — the route of the create page behind
  `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new detected error („Festgestellter Fehler anlegen") was glued above the list
of the catalog, the same way the mask of the new fault type was (WP-M14-162).
The mask is a page of its own now, the list offers a button that opens it.

1. `apps/web/src/admin/detected-error-form-parts.tsx` (new): the parts that the
   list and the create page share — the `errorMessage` of the error codes of
   the detected errors and the `jsonHeaders`.
2. `apps/web/src/admin/detected-error-create-page.tsx` (new):
   `DetectedErrorCreatePage` — the heading, the key field, the German and the
   English label, the error line and the button „Anlegen". The page needs
   `settings.write`, offers a link back to the list and returns to the list
   after a successful `POST /v1/detected-errors`.
3. `apps/web/src/admin/detected-errors-page.tsx`: the inline create form is
   gone; the list carries the button under the heading, it leads to
   `/admin/detected-errors/new`. The table, the editing, the archiving and the
   delete stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/detected-errors/new`
   behind `RequireSession`.
5. The tests follow: a new test proves the form on its own page, the `POST
   /v1/detected-errors` and the return to the list.

## Non-goals

- No change of the editing of a detected error: the edit form stays below the
  table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `detectedErrors.createTitle`, the link back carries
  `detectedErrors.title`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the list.

## Handoff

- Files changed: `apps/web/src/admin/detected-error-form-parts.tsx` (new),
  `apps/web/src/admin/detected-error-create-page.tsx` (new),
  `apps/web/src/admin/detected-errors-page.tsx` (the button instead of the
  inline form), `apps/web/src/routes/index.tsx` (the route), the new test,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `DetectedErrorCreatePage`, the route
  `/admin/detected-errors/new`, the shared parts of
  `detected-error-form-parts.tsx`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
- Follow-up WP: none — the comment of the office is closed
- Open question: none
