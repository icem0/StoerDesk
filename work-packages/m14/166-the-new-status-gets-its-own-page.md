# WP-M14-166: the new status gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.9; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-165

files-read:

- apps/web/src/admin/status-page.tsx (the table and the inline create form)
- apps/web/src/admin/status-form.tsx (the form of the create and the edit)
- apps/web/src/admin/__tests__/status-page.test.tsx (the tests of the table)
- apps/web/src/routes/index.tsx (the routes of the administration)
- specs/07-escalation.md (§7.9 the statuses)
- docs/REPO-MAP.md (the module of the status page)

files-write:

- apps/web/src/admin/status-create-page.tsx
- apps/web/src/admin/status-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/status-create-page.test.tsx,
  apps/web/src/admin/__tests__/status-page.test.tsx
- work-packages/m14/166-the-new-status-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `StatusCreatePage` — the own page of the new status at
  `/admin/statuses/new`
- `/admin/statuses/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new status was glued below the table of the statuses, the same way the mask of
the new webhook was (WP-M14-165). The mask is a page of its own now, the table
offers a button that opens it.

1. `apps/web/src/admin/status-create-page.tsx` (new): `StatusCreatePage` — the
   back link to the table and the form of `StatusForm` with `status={null}`.
   The page needs `settings.write`, writes with `POST /v1/admin/statuses` and
   returns to the table after a successful write. The heading of the form is
   the heading of the page, so no second heading stands above it.
2. `apps/web/src/admin/status-page.tsx`: the inline create form is gone; the
   table carries the button „Status anlegen" under the heading, it leads to
   `/admin/statuses/new`. The table, the editing of a row and the removal with
   its confirmation stay as they are.
3. `apps/web/src/routes/index.tsx`: the route `/admin/statuses/new` behind
   `RequireSession`.
4. The tests follow: the table test expects the button as a link, a new test
   proves the form on its own page, the `POST /v1/admin/statuses` and the
   return to the table.

## Non-goals

- No change of the editing of a status: the edit form stays below the table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading of the form share the key
  `admin.status.createTitle`, the link back carries `admin.status.title`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the table.

## Handoff

- Files changed: `apps/web/src/admin/status-create-page.tsx` (new),
  `apps/web/src/admin/status-page.tsx` (the button instead of the inline
  form), `apps/web/src/routes/index.tsx` (the route), the two tests,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `StatusCreatePage`, the route `/admin/statuses/new`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: WP-M14-167 (the new transition gets its own page) — its file
  is created with this commit (`AGENTS.md`, _Open follow-ups (mandatory
  closure)_)
- Open question: none
