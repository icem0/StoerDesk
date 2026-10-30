# WP-M1-09d: admin roles UI

format: small-model
status: done
depends-on: WP-M1-09b, WP-M1-09c
phase: 1
context-budget: 26k tokens
spec: specs/01-rbac.md §3.2 (UI hiding is cosmetic), §3.8 (role API and its guards); PLAN.md §16
spec-lines: 19

files-read:

- specs/01-rbac.md (§3.8)
- apps/web/src/admin/users-page.tsx
- apps/web/src/auth/usePermission.ts
- apps/web/src/lib/api.ts
- apps/web/src/routes/index.tsx
- packages/shared/src/permissions.ts

files-write:

- apps/web/src/admin/roles-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/lib/api.ts

interfaces:

- `RolesPage` rendered at route `/admin/roles`
- `useRoles(): UseQueryResult<RoleListResponse>` — query key `['roles']` via
  `apiFetch<RoleListResponse>('/v1/roles')`, `retry: false`
- role payloads/types come from `@stoerdesk/shared`: `RoleSummary`, `RoleListResponse`,
  `CreateRoleRequest`, `UpdateRoleRequest`
- permission checkboxes are built from `PERMISSION_KEYS` (the catalog, §3.4) — keys only,
  never translated text
- `apiFetch<T>` answers `204 No Content` with `undefined as T` instead of throwing on the
  empty body, so `DELETE /api/v1/roles/:key` is usable
- error codes `session_invalid`, `forbidden`, `invalid_request`, `role_not_found`,
  `role_key_taken`, `system_role_protected`, `role_in_use`, `unknown_permission_key` map to
  `settings:admin.roles.errors.<code>`
- no API or schema changes; `requirePermission` stays the only enforcement point

## Task

Third slice of the legacy WP-M1-09: the role side of the admin area, reading the role API
of WP-M1-09b (`specs/01-rbac.md` §3.8). The users page of WP-M1-09c is the pattern.

1. `apps/web/src/lib/api.ts`: a `204` response (empty body) returns `undefined as T`; the
   existing `{ code, params }` error parsing stays untouched.

2. `apps/web/src/admin/roles-page.tsx`: `RolesPage` loads `/me` (`useMe`) and the role list
   (`['roles']`). While `/me` is pending show the loading text, on error the session notice,
   and without `role.read` the forbidden notice — same three states as `UsersPage`.

3. Table for `role.read`: `key`, system/custom label, permission key count, `userCount`, and
   an action column only with `role.write`. `POST`/`PATCH`/`DELETE` are guarded by
   `role.write`; the buttons are cosmetic (§3.2).

4. With `role.write`: a create form (key input plus the `PERMISSION_KEYS` checkbox grid)
   POSTing `/api/v1/roles`, a per-row edit form for **custom** roles PATCHing
   `/api/v1/roles/:key` with the selected `permissionKeys` (`key` and `isSystem` are never
   sent), and a delete button per custom role DELETEing `/api/v1/roles/:key`. System roles
   get a read-only notice instead of edit/delete controls, because the API answers
   `409 system_role_protected` and the seed rewrites their grants (§3.1).

5. Every mutation is a `useMutation` + `apiFetch` call that invalidates `['roles']` on
   success and renders the mapped error code; without a session no list is requested.

6. i18n fixtures (not source files): every visible string goes into the existing `settings`
   namespace of `de/settings.json` and `en/settings.json` (`admin.roles.*`,
   `admin.roles.errors.*`), de and en complete. No literals in JSX.

7. Tests (excluded from `files-write`):
   `apps/web/src/admin/__tests__/roles-page.test.tsx` with the `QueryClientProvider` +
   `I18nextProvider` wrapper and a stubbed `fetch` of the users-page test: `/me` with
   `role.read` renders the seeded role rows, `role.write` adds create/edit/delete controls
   while system roles stay read-only, a `401` from `/me` renders the session notice, and
   without `role.read` the forbidden notice appears instead of the table.

## Non-goals

- No per-user `user_permissions` allow/deny UI, no role rename, no role copy, no audit
  trail (`specs/01-rbac.md` §3.8).
- No editing of system role grants, no API change, no new permission keys.
- No login form, logout button or route guard (WP-M1-09e).
- No search, sorting or pagination over roles and permission keys.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` reports the `settings` namespace with the new
`admin.roles.*` keys complete in de and en, `wp:check` counts the new WP document.

## Handoff

- Files changed: `apps/web/src/admin/roles-page.tsx` (new), `apps/web/src/routes/index.tsx`,
  `apps/web/src/lib/api.ts`, the `settings.json` fixtures (de/en), the new test file and the
  bookkeeping outside `files-write` (`CHANGELOG.md`, `AGENTS.md`, `PLAN.md` §16,
  `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: `RolesPage` at `/admin/roles`, the local `useRoles()` query on
  `['roles']`, the `PERMISSION_KEYS` checkbox grid, and `apiFetch` now answers `204` with
  `undefined` instead of throwing on the empty body
- Deviation: the delete control lives inside the edit form of a custom role (one mutation
  surface, one error notice) instead of a separate row button; system roles show
  `readOnly` instead of edit/delete, so `system_role_protected` should not appear from the UI
- Verified: `npm run check` green — 125 tests, 8 in `apps/web/src/admin` (4 `UsersPage`,
  4 `RolesPage`), `i18n:check` 65 de / 65 en keys
- Follow-up WP: WP-M1-09e (`09e-login-form-guard.md`, file created in this commit),
  WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
