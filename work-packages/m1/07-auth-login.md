# WP-M1-07: Auth — session core (token, sessions table)

format: small-model
depends-on: WP-M1-06
phase: 1
context-budget: 20k tokens
spec: specs/01-rbac.md §3.6; PLAN.md §4 (Auth), §15 (Security)
spec-lines: 25

files-read:

- specs/01-rbac.md (§3.6)
- apps/api/src/db/schema.ts (`users`, `sessions`, `userRoles`, `roles`)
- apps/api/src/config/env.ts (`SESSION_TTL_HOURS`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`)
- apps/api/src/auth/password.ts
- apps/api/src/db/client.ts
- apps/api/src/db/**tests**/helpers/testDatabase.ts

files-write:

- packages/shared/src/schemas/auth.ts
- packages/shared/src/schemas/index.ts
- apps/api/src/auth/session.ts

interfaces:

- `loginRequestSchema`, `meResponseSchema`, `type LoginRequest`, `type MeResponse`
  (shared, exported through `@stoerdesk/shared`)
- `SESSION_COOKIE_NAME = 'session'`,
  `hashSessionToken(token: string): string`
- `createSession(database, userId: string, ttlHours: number): Promise<{ token: string; expiresAt: Date }>`
- `loadSession(database, token: string): Promise<SessionUser | undefined>`
- `destroySession(database, token: string): Promise<void>`
- `loadUserRoleKeys(database, userId: string): Promise<string[]>`
- `sessionCookieOptions(env, expiresAt: Date): SessionCookieOptions`

## Task

Split note: the legacy WP-M1-07 covered service, plugin, routes and schemas — more
than the four source files allowed by `PLAN.md` §17. This package holds the session
core, the HTTP layer is the new **WP-M1-07b** (`07b-auth-routes.md`).

1. `packages/shared/src/schemas/auth.ts`: `loginRequestSchema` with
   `email` (`z.string().trim().toLowerCase().pipe(z.email())`) and `password`
   (`z.string().min(1).max(256)` — an input cap, Argon2 has no length limit itself);
   `meResponseSchema` with `user: { id: uuid, email, locale: 'de' | 'en', roles: string[] }`.
   Export both from `packages/shared/src/schemas/index.ts` — no other schema file
   changes.
2. `apps/api/src/auth/session.ts` token: `createSession` generates
   `randomBytes(32)` as base64url, stores only `hashSessionToken(token)`
   (SHA-256, hex) with `expires_at = now + ttlHours` in `sessions`, and returns the
   plaintext token once. The token is never logged.
3. `loadSession(database, token)`: one select over `sessions ⋈ users` filtered by
   token hash **and** `expires_at > now`, returning
   `SessionUser = { id, email, locale }` only for `active = true` users; expired
   rows for that hash are deleted on read (`delete ... where expires_at <= now`),
   an unknown, expired or inactive session yields `undefined`.
4. `destroySession(database, token)` deletes by token hash (no throw when nothing
   matches). `loadUserRoleKeys(database, userId)` returns the role keys of
   `user_roles ⋈ roles` — permission resolution stays in WP-M1-08.
5. `sessionCookieOptions(env, expiresAt)`: `{ name: SESSION_COOKIE_NAME, httpOnly:
true, sameSite: env.COOKIE_SAME_SITE, secure: env.COOKIE_SECURE, path: '/',
maxAge: <seconds until expiresAt, at least 0> }`. No route is added in this WP.
6. Tests (excluded from `files-write`): `apps/api/src/auth/__tests__/session.spec.ts`
   — token length/entropy and distinct tokens, `hashSessionToken` is stable, hex and
   never the token, cookie options carry `httpOnly`/`sameSite`/`secure` and a `maxAge`
   of `0` for a past expiry. `apps/api/src/auth/__tests__/session.integration.spec.ts`
   — create → `loadSession` returns the user, a foreign token yields `undefined`, a
   row with `expires_at` in the past yields `undefined` and is gone, `destroySession`
   logs out, an inactive user is not loadable, role keys come back for a linked user.

## Non-goals

- No routes, no cookie writing, no Fastify plugin — WP-M1-07b.
- No `requirePermission` and no effective permissions (WP-M1-08), no login UI
  (WP-M1-09 / WP-M1-12).
- No CSRF token, no sliding sessions, no scheduled purge of expired rows, no
  lockout or audit of failed logins.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green. With a reachable database (`TEST_DATABASE_URL`) the new
integration spec runs; without one it skips and the skip is reported — then the CI
`check` job (PostgreSQL 16 service) is the executed acceptance.

## Handoff

- Files changed: the three files above plus the two test files and the bookkeeping
  outside `files-write` (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`,
  `work-packages/README.md`)
- Interfaces added: the shared login/me schemas and the session core functions
- Follow-up WP: WP-M1-07b — login, logout and `/me` on top of these functions; with
  it the phase 1 exit criterion "login as admin works" becomes reachable
- Open question: phase 1 has no WP for the **login form UI** (`WP-M1-09` is the admin
  UI, `WP-M1-12` the E2E smoke test) — clarify before WP-M1-12
