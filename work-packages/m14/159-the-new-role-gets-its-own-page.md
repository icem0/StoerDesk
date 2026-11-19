# WP-M14-159: the new role gets its own page

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/01-rbac.md §3.1; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-158

files-read:

- apps/web/src/admin/roles-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/roles-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the roles)
- specs/01-rbac.md (§3.1 the roles)
- docs/REPO-MAP.md (the module of the roles page)

files-write:

- apps/web/src/admin/role-form-parts.tsx, apps/web/src/admin/role-create-page.tsx
- apps/web/src/admin/roles-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/role-create-page.test.tsx, apps/web/src/admin/__tests__/roles-page.test.tsx
- work-packages/m14/159-the-new-role-gets-its-own-page.md, docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `RoleCreatePage` — the own page of the new role at `/admin/roles/new`
- `role-form-parts.tsx` — `PermissionCheckboxes`, `toggleKey`, `errorMessage`,
  `jsonHeaders` — the parts that the list and the create page share
- `/admin/roles/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask
„Rolle anlegen" was glued below the list of the roles, the same way the mask
of the new user was (WP-M14-158). The mask is a page of its own now, the list
offers a button that opens it.

1. `apps/web/src/admin/role-form-parts.tsx` (new): the parts that the list and
   the create page share — `PermissionCheckboxes`, `toggleKey`, the
   `errorMessage` of the error codes of the roles and the `jsonHeaders`.
2. `apps/web/src/admin/role-create-page.tsx` (new): `RoleCreatePage` — the
   heading „Rolle anlegen", the key field, the grid of the permissions, the
   error line and the button „Anlegen". The page needs `role.write`, offers a
   link back to the list and returns to the list after a successful `POST
   /v1/roles`.
3. `apps/web/src/admin/roles-page.tsx`: the inline create form is gone; the
   list carries the button „Rolle anlegen" under the heading, it leads to
   `/admin/roles/new`. The table, the grant editor, the delete and the read-only
   system roles stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/roles/new` behind
   `RequireSession`.
5. The tests follow: the list test expects the button as a link, a new test
   proves the form on its own page, the `POST /v1/roles` and the return to the
   list.

## Non-goals

- No change of the grant editor of a role: it stays below the table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.roles.createTitle`, the link back carries `admin.roles.title`.

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

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-160 (the new group gets its own page) — its file is
  created with the commit of WP-M14-159 (`AGENTS.md`, _Open follow-ups
  (mandatory closure)_)
- Open question: none
