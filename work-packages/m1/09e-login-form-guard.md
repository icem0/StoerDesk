# WP-M1-09e: login form, logout button and route guard in apps/web

format: small-model
status: done
depends-on: WP-M1-07b, WP-M1-09c
phase: 1
context-budget: 24k tokens
spec: specs/01-rbac.md §3.2 (UI hiding is cosmetic), §3.6 (login, logout, `me`); PLAN.md §16
spec-lines: 16

files-read:

- specs/01-rbac.md (§3.6)
- packages/shared/src/schemas/auth.ts
- apps/web/src/auth/usePermission.ts
- apps/web/src/lib/api.ts
- apps/web/src/routes/index.tsx
- apps/web/src/App.tsx

files-write:

- apps/web/src/auth/login-form.tsx
- apps/web/src/auth/require-session.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/App.tsx

interfaces:

- `LoginForm` — e-mail + password form, `POST /api/v1/auth/login` through `useMutation` +
  `apiFetch<MeResponse>`, on success invalidates `['me']` and re-renders the guarded area
- `LogoutButton` — `POST /api/v1/auth/logout` (`204`), then invalidates `['me']` and
  `['users']`/`['roles']`
- `RequireSession({ children })` — route guard around the admin pages: pending → loading
  text, `/me` error → `LoginForm`, success → `children`; the server guard stays the only
  enforcement point (§3.2)
- error codes `invalid_credentials`, `rate_limited`, `invalid_request`, `session_invalid`
  map to `common:auth.errors.<code>`
- no API change: login, logout and `/me` exist since WP-M1-07b/WP-M1-08

## Task

Closes the open question of WP-M1-07/WP-M1-09: phase 1 has no login UI, so the phase 1
exit criterion "login as admin works" cannot be reached and WP-M1-12 cannot test it.

1. `apps/web/src/auth/login-form.tsx`: `LoginForm` with e-mail and password inputs, client
   side `loginRequestSchema.parse` for the field hints only, then
   `apiFetch<MeResponse>('/v1/auth/login', { method: 'POST', ... })`. Unknown credentials,
   wrong password and an inactive account all show the same `invalid_credentials` text
   (§3.6 — no account enumeration), a `429` shows `rate_limited`. No password is echoed.

2. `apps/web/src/auth/login-form.tsx` also exports `LogoutButton`, which POSTs
   `/v1/auth/logout`, ignores the `204` body and invalidates the cached queries.

3. `apps/web/src/auth/require-session.tsx`: `RequireSession` uses `useMe()`; while pending
   the loading text, on error the `LoginForm`, otherwise the children. It wraps
   `UsersPage` and `RolesPage` in `apps/web/src/routes/index.tsx` (nested routes or a
   wrapper element) — the admin pages themselves stay unchanged.

4. `apps/web/src/App.tsx`: render the session state (login form, or the signed-in e-mail
   plus `LogoutButton` and links to `/admin/users` and `/admin/roles`), so the shell shows
   who is signed in.

5. i18n fixtures (not source files): every string into the `common` namespace of
   `de/common.json` and `en/common.json` (`auth.*`, `auth.errors.*`), de and en complete.
   No literals in JSX.

6. Tests (excluded from `files-write`):
   `apps/web/src/auth/__tests__/login-form.test.tsx` and
   `apps/web/src/auth/__tests__/require-session.test.tsx` with the `QueryClientProvider` +
   `I18nextProvider` wrapper and the stubbed `fetch` of the admin page tests: a successful
   login swaps the form for the guarded content, `401 invalid_credentials` renders the
   shared notice, `429` renders the rate-limit notice, and `RequireSession` renders the
   form while `/me` answers `401`.

## Non-goals

- No password reset, no registration, no MFA, no CSRF token (§3.6 keeps `SameSite=Lax`).
- No locale switcher, no session expiry countdown, no scheduled session purge.
- No changes to the API, the shared schemas or the permission catalog.
- No Playwright E2E (WP-M1-12 needs this WP as its precondition).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `i18n:check` reports the new `common:auth.*` keys complete in de and en.

## Handoff

- Files changed: `apps/web/src/auth/login-form.tsx` (`LoginForm`, `LogoutButton`),
  `apps/web/src/auth/require-session.tsx` (`RequireSession`), `apps/web/src/routes/index.tsx`
  (the two `/admin/*` routes became children of one guarded parent route), `apps/web/src/App.tsx`
  (shell shows the session), `apps/web/src/i18n/locales/{de,en}/common.json` (`auth.*`),
  `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: `LoginForm`, `LogoutButton`, `RequireSession({ children })`,
  `common:auth.{title,loading,submit,logout,invalidHint,signedInAs,fields.*,links.*,errors.*}`
- Deviation: none — the guarded parent route uses `<Outlet />`, so `UsersPage` and `RolesPage`
  stayed untouched; the login response is written into the `['me']` cache and additionally
  invalidated, so the guarded area swaps without a second round-trip
- Verified: `npm run check` green — 132 tests, 10 in `apps/web/src/auth` (3 `usePermission`,
  4 `LoginForm`, 3 `RequireSession`), `i18n:check` 80 de / 80 en keys
- Follow-up WP: WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
