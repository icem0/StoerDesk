# WP-M1-07b: Auth — login, logout and me routes

format: small-model
depends-on: WP-M1-07
phase: 1
context-budget: 24k tokens
spec: specs/01-rbac.md §3.6; PLAN.md §4 (Auth), §15 (Security: rate limit, CSRF)
spec-lines: 25

files-read:

- specs/01-rbac.md (§3.6)
- apps/api/src/auth/session.ts
- packages/shared/src/schemas/auth.ts
- apps/api/src/index.ts
- apps/api/src/config/env.ts
- apps/api/src/db/client.ts

files-write:

- apps/api/src/auth/sessionPlugin.ts
- apps/api/src/auth/routes.ts
- apps/api/src/index.ts

interfaces:

- `sessionPlugin` (fastify-plugin, opts `{ database, env }`) — decorates
  `request.user?: { id, email, locale, roles }`
- `requireUser` (preHandler, `401` with `{ code: 'session_invalid' }`)
- `authRoutes` (fastify-plugin, opts `{ database, env }`) registering
  `POST /api/v1/auth/login` (rate limit `5` per minute per IP),
  `POST /api/v1/auth/logout`, `GET /api/v1/me`
- error codes: `invalid_credentials` (`401`), `session_invalid` (`401`),
  `invalid_request` (`400`, `params.fields`), `rate_limited` (`429`)

## Task

Split note: `PLAN.md` §17 allows max. four source files per WP, so the legacy
WP-M1-07 was cut into WP-M1-07 (session core) and this package (HTTP layer).

1. `apps/api/src/auth/sessionPlugin.ts`: fastify-plugin taking
   `{ database, env }`. It decorates the request with `user` (undefined) and, in an
   `onRequest` hook, reads the `SESSION_COOKIE_NAME` cookie; with a cookie it calls
   `loadSession` and, when a user is found, `loadUserRoleKeys`, then sets
   `request.user`. No cookie, unknown token, expired row or inactive user leave
   `request.user` undefined. Export the preHandler `requireUser` that answers
   `401 { code: 'session_invalid', params: {} }`. Module augmentation for
   `FastifyRequest.user` lives in this file.
2. `apps/api/src/auth/routes.ts`: fastify-plugin taking `{ database, env }`.
   `POST /api/v1/auth/login` — `routeOptions.config.rateLimit = { max: 5,
timeWindow: '1 minute' }`; parse the body with `loginRequestSchema`
   (`400 { code: 'invalid_request', params: { fields } }` on failure); look up the
   user by the normalized e-mail; `verifyPassword` (WP-M1-06); missing user, wrong
   password and `active = false` all answer the identical
   `401 { code: 'invalid_credentials', params: {} }`. On success `createSession`
   with `env.SESSION_TTL_HOURS`, set the cookie via `sessionCookieOptions` and reply
   `200 { user: { id, email, locale, roles } }`.
3. `POST /api/v1/auth/logout` — `destroySession` when a cookie is present, clear the
   cookie (same `path`/`sameSite`/`secure`), always `204`.
   `GET /api/v1/me` — `requireUser`, then `200` in the `meResponseSchema` shape.
4. `apps/api/src/index.ts`: create the database with `createDatabase()`, close the
   pool in `app.addHook('onClose', …)`, register `sessionPlugin` and `authRoutes`
   with `{ database, env }` after cookie/CORS/rate-limit, and give the global
   rate-limit plugin an `errorResponseBuilder` replying
   `{ code: 'rate_limited', params: { window: env.RATE_LIMIT_WINDOW } }`. The health
   route stays public.
5. Test (excluded from `files-write`):
   `apps/api/src/auth/__tests__/authRoutes.integration.spec.ts` — migrate +
   `seedRbac` + one Argon2id user linked to `admin`, `process.env.DATABASE_URL`
   pointed at the test database before `buildServer()`. Five required cases: login
   with the right password `200` + `session` cookie (httpOnly, SameSite=Lax); login
   with a wrong password `401` `invalid_credentials`; `/me` without cookie `401`
   `session_invalid`; `/me` with cookie `200` with `roles: ['admin']`; logout `204`
   clears the cookie and a following `/me` is `401`. Additionally: malformed body
   `400`, inactive user `401`, and the sixth login attempt inside the window is `429`.

## Non-goals

- No permission resolution and no `requirePermission` guard (WP-M1-08), `/me` stays
  without a `permissions` array until then.
- No login form, no logout button, no session refresh UI (WP-M1-09, WP-M1-12).
- No CSRF token, no brute-force lockout, no audit event for failed logins, no
  cleanup job for expired sessions.
- No OpenAPI / type-provider wiring (phase 10).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the five required cases pass against a real PostgreSQL 16
(CI `check` job or `TEST_DATABASE_URL`) — they skip without a reachable database,
which must be reported.

## Handoff

- Files changed: the three files above plus the integration spec and the bookkeeping
  outside `files-write` (`docs/REPO-MAP.md`, `AGENTS.md`, `CHANGELOG.md`,
  `work-packages/README.md`)
- Interfaces added: `sessionPlugin`, `requireUser`, `authRoutes` and the three
  session routes
- Verified against the running server: `POST /api/v1/auth/login` then
  `GET /api/v1/me` with the cookie
- Follow-up WP: WP-M1-08 (`requirePermission`, effective permissions, then
  `permissions` in `/me`)
- Open question: no WP covers the login form UI, which WP-M1-12 (E2E "login as
  admin") needs — add it before WP-M1-12
