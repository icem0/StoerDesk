# WP-M1-09c: usePermission and admin users UI

format: small-model
status: done
depends-on: WP-M1-09, WP-M1-09b
phase: 1
context-budget: 26k tokens
spec: specs/01-rbac.md §3.2 (UI hiding is cosmetic), §3.6 (`me`), §3.7 (UI-side `usePermission` row); PLAN.md §16
spec-lines: 0

files-read:

- specs/01-rbac.md (§3.2, §3.6, §3.7)
- apps/web/src/lib/api.ts
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/index.ts
- packages/shared/src/schemas/user.ts
- packages/shared/src/schemas/auth.ts

files-write:

- apps/web/src/auth/usePermission.ts
- apps/web/src/admin/users-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/lib/api.ts

interfaces:

- `useMe(): UseQueryResult<MeResponse>` — TanStack Query on `['me']` via
  `apiFetch<MeResponse>('/v1/me')`
- `usePermission(...keys: string[]): boolean` — OR semantics over the `permissions`
  array of `/me`; false while `/me` has not answered
- `UsersPage` rendered at route `/admin/users`
- `apiFetch` parses an `{ code, params }` error body into `ApiError` so the UI can
  tell `email_taken` from `last_admin`
- error codes of the user and role APIs (`session_invalid`, `forbidden`,
  `invalid_request`, `email_taken`, `last_admin`, `unknown_role_key`) map to
  `settings:admin.users.errors.<code>` keys
- no API or schema changes; the server guard stays the only enforcement point

## Task

1. `apps/web/src/auth/usePermission.ts`: export `useMe` (query key `['me']`,
   `apiFetch`, `retry: false`) and `usePermission(...keys)` reading the cached `/me`
   answer. `usePermission` mirrors the server's OR semantics; hiding controls is
   cosmetic only (§3.2), the routes stay guarded server-side.

2. `apps/web/src/admin/users-page.tsx`: `UsersPage` loads the user list
   (`GET /api/v1/users`) and the role list (`GET /api/v1/roles`, used for the role
   checkboxes). Render a table (e-mail, locale, active state, role keys) for viewers
   with `user.read`. With `user.write` add a create form (e-mail, password,
   locale, active, role keys) and an edit control per row (locale, active, role
   keys, optional new password) PATCHing `/api/v1/users/:id`. Mutations use
   `useMutation` + `apiFetch`, invalidate `['users']` on success and show the mapped
   error code. Without `/me` success show the session notice, without `user.read`
   the forbidden notice.

3. `apps/web/src/routes/index.tsx`: add the `/admin/users` route rendering
   `UsersPage`; keep `/` untouched.

4. i18n fixtures (not source files): put every visible string of the page into the
   existing `settings` namespace of both `settings.json` files (de and en complete;
   the `admin.users.*` and `admin.users.errors.*` keys). No literals in JSX
   (`i18next/no-literal-string`).

5. Tests (excluded from `files-write`):
   `apps/web/src/auth/__tests__/usePermission.test.tsx` and
   `apps/web/src/admin/__tests__/users-page.test.tsx` with a `QueryClientProvider`
   wrapper and a stubbed `fetch` (`vi.stubGlobal`): `/me` permissions drive
   `usePermission`, stubbed list responses render rows, a `403` from `/me` renders
   the session notice instead of the table.

## Non-goals

- No login form, logout button or route guard (WP-M1-09e); `/me` failing is only
  answered with a notice.
- No roles UI (WP-M1-09d), no user delete, no group membership, no audit trail.
- No table search, sorting or pagination; the user count in phase 1 is small.
- No changes to the API, the shared schemas or the permission catalog.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` reports the `settings` namespace with the new keys
complete in de and en, and every key referenced in the page exists.

## Handoff

- Files changed: the four source files above, the `settings.json` fixtures (de/en),
  the two test files and the bookkeeping outside `files-write`
- Interfaces added: `useMe`, `usePermission`, `UsersPage` at `/admin/users`, and
  `apiFetch` now parses the `{ code, params }` error body into `ApiError`
- Deviation: `useRoles(enabled)` gates the role query on `user.write`; the edit
  form omits the e-mail (PATCH does not change it)
- Verified: `npm run check` green — 9 web tests (3 `usePermission`, 4 `UsersPage`,
  2 i18n)
- Follow-up WP: WP-M1-09d (roles UI), WP-M1-09e (login form, logout, route guard),
  WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
