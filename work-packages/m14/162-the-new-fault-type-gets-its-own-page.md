# WP-M14-162: the new fault type gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/06-report-form.md §7.9; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-158

files-read:

- apps/web/src/admin/text-templates-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/text-templates-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the fault types)
- specs/06-report-form.md (§7.9 the catalog of the fault types)
- docs/REPO-MAP.md (the module of the fault types page)

files-write:

- apps/web/src/admin/text-template-form-parts.tsx, apps/web/src/admin/text-template-create-page.tsx
- apps/web/src/admin/text-templates-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/text-template-create-page.test.tsx,
  apps/web/src/admin/__tests__/text-templates-page.test.tsx
- work-packages/m14/162-the-new-fault-type-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `TextTemplateCreatePage` — the own page of the new fault type at
  `/admin/text-templates/new`
- `text-template-form-parts.tsx` — `TranslationFields`, `errorMessage`,
  `jsonHeaders` — the parts that the list and the create page share
- `/admin/text-templates/new` — the route of the create page behind
  `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** Every record of the
administration was created with a mask that was glued below or above the list
of the records. The mask of the new fault type („Störungsart anlegen") is a
page of its own now, the list offers a button that opens it.

1. `apps/web/src/admin/text-template-form-parts.tsx` (new): the parts that the
   list and the create page share — the German/English pair of the texts
   (`TranslationFields`), the `errorMessage` of the error codes of the fault
   types and the `jsonHeaders`.
2. `apps/web/src/admin/text-template-create-page.tsx` (new):
   `TextTemplateCreatePage` — the heading „Störungsart anlegen", the key field,
   the German and the English text, the error line and the button „Anlegen".
   The page needs `settings.write`, offers a link back to the list and returns
   to the list after a successful `POST /v1/text-templates`.
3. `apps/web/src/admin/text-templates-page.tsx`: the inline create form is
   gone; the list carries the button „Störungsart anlegen" under the heading,
   it leads to `/admin/text-templates/new`. The table, the editing, the
   archiving and the delete stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/text-templates/new`
   behind `RequireSession`.
5. The tests follow: a new test proves the form on its own page, the `POST
   /v1/text-templates` and the return to the list.

## Non-goals

- No change of the editing of a fault type: the edit form stays below the
  table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.textTemplates.createTitle`, the link back carries
  `admin.textTemplates.title`.

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

- Files changed: `apps/web/src/admin/text-template-form-parts.tsx` (new),
  `apps/web/src/admin/text-template-create-page.tsx` (new),
  `apps/web/src/admin/text-templates-page.tsx` (the button instead of the
  inline form), `apps/web/src/routes/index.tsx` (the route), the new test,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `TextTemplateCreatePage`, the route
  `/admin/text-templates/new`, the shared parts of
  `text-template-form-parts.tsx`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: WP-M14-163 (the new detected error gets its own page) — its
  file is created with this commit (`AGENTS.md`, _Open follow-ups (mandatory
  closure)_)
- Open question: none
