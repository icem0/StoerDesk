# WP-M14-158: the new user gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/01-rbac.md §3.2; PLAN.md §16
spec-lines: 20

depends-on: WP-M1-09c

files-read:

- apps/web/src/admin/users-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/users-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the users)
- specs/01-rbac.md (§3.2 the permission model)
- docs/REPO-MAP.md (the module of the users page)

files-write:

- apps/web/src/admin/user-form-parts.tsx, apps/web/src/admin/user-create-page.tsx
- apps/web/src/admin/users-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/user-create-page.test.tsx, apps/web/src/admin/__tests__/users-page.test.tsx
- work-packages/m14/158-the-new-user-gets-its-own-page.md, docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `UserCreatePage` — the own page of the new user at `/admin/users/new`
- `user-form-parts.tsx` — `UserFormValues`, `RoleCheckboxes`, `useRoles`,
  `errorMessage`, `jsonHeaders` — the parts that the list and the create page
  share
- `/admin/users/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask
„Benutzer anlegen" was glued below the list of the users: the list of the
installation is long, the mask lies far below it, and the mask hides the list
while it is open. The mask is a page of its own now, the list offers a button
that opens it.

1. `apps/web/src/admin/user-form-parts.tsx` (new): the parts that the list and
   the create page share — `UserFormValues` with its `UserLocale` and
   `UserTheme`, `RoleCheckboxes`, the `useRoles` query, the `errorMessage` of
   the error codes of the users and the `jsonHeaders`.
2. `apps/web/src/admin/user-create-page.tsx` (new): `UserCreatePage` — the
   heading „Benutzer anlegen", the form with the e-mail, the name, the
   password, the language, the design, the active flag and the roles, the
   error line and the button „Anlegen". The page needs `user.write`, offers a
   link back to the list and returns to the list after a successful `POST
   /v1/users`.
3. `apps/web/src/admin/users-page.tsx`: the inline create form is gone; the
   list carries the button „Benutzer anlegen" under the heading, it leads to
   `/admin/users/new`. The table, the editing of a row, the one-time password
   and the reset of a password stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/users/new` behind
   `RequireSession`.
5. The tests follow: the list test expects the button as a link, a new test
   proves the form on its own page, the `POST /v1/users` and the return to the
   list.

## Non-goals

- No change of the editing of a user: the edit form of a row stays below the
  table.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.users.createTitle`, the link back carries `admin.users.title`.

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

- Files changed: `apps/web/src/admin/user-form-parts.tsx` (new),
  `apps/web/src/admin/user-create-page.tsx` (new),
  `apps/web/src/admin/users-page.tsx` (the button instead of the inline form),
  `apps/web/src/routes/index.tsx` (the route), the two tests,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `UserCreatePage`, the route `/admin/users/new`, the shared
  parts of `user-form-parts.tsx`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: WP-M14-159 (the new role gets its own page) and WP-M14-160
  (the new group gets its own page) — their files are created with this
  commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none
