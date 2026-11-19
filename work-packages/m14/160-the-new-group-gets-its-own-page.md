# WP-M14-160: the new group gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/01-rbac.md §3.2; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-159

files-read:

- apps/web/src/admin/groups-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/groups-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the groups)
- specs/01-rbac.md (§3.2 the permission model)
- docs/REPO-MAP.md (the module of the groups page)

files-write:

- apps/web/src/admin/group-form-parts.tsx, apps/web/src/admin/group-create-page.tsx
- apps/web/src/admin/groups-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/group-create-page.test.tsx, apps/web/src/admin/__tests__/groups-page.test.tsx
- work-packages/m14/160-the-new-group-gets-its-own-page.md, docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `GroupCreatePage` — the own page of the new group at `/admin/groups/new`
- `group-form-parts.tsx` — `errorMessage`, `jsonHeaders` — the parts that the
  list and the create page share
- `/admin/groups/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask
„Gruppe anlegen" was glued below the list of the groups, the same way the mask
of the new user was (WP-M14-158). The mask is a page of its own now, the list
offers a button that opens it.

1. `apps/web/src/admin/group-form-parts.tsx` (new): the parts that the list
   and the create page share — the `errorMessage` of the error codes of the
   groups and the `jsonHeaders`.
2. `apps/web/src/admin/group-create-page.tsx` (new): `GroupCreatePage` — the
   heading „Gruppe anlegen", the name field, the error line and the button
   „Anlegen". The page needs `user.write`, offers a link back to the list and
   returns to the list after a successful `POST /v1/groups`.
3. `apps/web/src/admin/groups-page.tsx`: the inline create form is gone; the
   list carries the button „Gruppe anlegen" under the heading, it leads to
   `/admin/groups/new`. The table and the editing of a row stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/groups/new` behind
   `RequireSession`.
5. The tests follow: the list test expects the button as a link, a new test
   proves the form on its own page, the `POST /v1/groups` and the return to the
   list.

## Non-goals

- No change of the editing of a group: the edit form of a row stays below the
  table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.groups.createTitle`, the link back carries `admin.groups.title`.

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

- Files changed: `apps/web/src/admin/group-form-parts.tsx` (new),
  `apps/web/src/admin/group-create-page.tsx` (new),
  `apps/web/src/admin/groups-page.tsx` (the button instead of the inline form),
  `apps/web/src/routes/index.tsx` (the route), the new test,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `GroupCreatePage`, the route `/admin/groups/new`, the shared
  parts of `group-form-parts.tsx`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
- Follow-up WP: none — the comment of the office is closed
- Open question: none
