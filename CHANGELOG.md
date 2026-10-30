# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo skeleton with npm workspaces (`apps/web`, `apps/api`, `packages/shared`).
- Configuration: TypeScript strict, ESLint (flat config, i18next rule), Prettier,
  Vitest (root and per workspace), Husky, commitlint.
- Scripts: `npm run check`, `npm run i18n:check`, `npm run spec:split`,
  `npm run orchestrate`, `npm run wp:check`.
- Docker setup: `Dockerfile` (targets `api`, `web`), `docker-compose.yml`,
  `docker-compose.dev.yml`, `.env.example`.
- CI: `.github/workflows/check.yml` (Node 22, `npm ci`, `npm run check`).
- Specification structure `specs/` (17 chapter files), work packages
  `work-packages/m1` (12) and `work-packages/m2` (10), documentation `docs/`
  including REPO-MAP and ADR-0001.
- WP-M1-03: Drizzle base schema `apps/api/src/db/schema.ts` with `users`,
  `sessions`, `groups`, `user_groups`, `settings`; UUID v7 as server-side default
  via `gen_uuid_v7()` (ADR-0002), migration `0000_base_tables`, Drizzle client.
- WP-M1-03: migration test (without DB) and integration test against a real
  PostgreSQL 16 database (`TEST_DATABASE_URL`, disposable database per run,
  skipped without a reachable DB).
- Complete Compose stack: `db`, `api`, `web` and the optional `backup` profile
  (`pg_dump`).
- `.env.example` with every variable and explanation; `npm run env:create`
  creates `.env` with generated secrets, so the Compose file never has to be
  edited.
- Persistent volumes for database, uploads and backups; all volume names are
  configurable.
- Notification channels talk only to existing instances (ntfy server,
  signal-cli bridge, Matrix homeserver, SMTP, Telegram); StörDesk ships no
  notification servers. A channel stays disabled while its address is empty.
- `docs/DEPLOYMENT.md`: deployment, volumes, backups/restore, notification
  channels.
- `PLAN.md`: binding build plan with scope, stack decisions, phases, small-model
  work-package limits, acceptance summary and open decisions.
- `docs/WP-TEMPLATE.md` and `scripts/wp-check.mjs`: template and validation for
  work packages that fit a 64k–128k context model.
- Phase 0 work packages in `work-packages/m0/` for local startability, Compose
  resilience, plan anchoring and a Docker smoke test.
- `docker-compose.debug.yml`: optional override that publishes the API host port
  for direct curl and monitoring.
- `scripts/docker-smoke.sh` (WP-M0-04): repeatable Docker smoke test — builds the
  images from the checkout, starts the stack in an isolated Compose project with
  its own volumes and web port `3180`, checks `/healthz` and `/api/v1/health`,
  asserts that the API publishes no host port and removes everything again. Runs
  as the CI job `docker-smoke`, which skips on runners without Docker.
- WP-M0-05: `.github/workflows/build.yml` (`build and push`) publishes the
  versioned `api` and `web` images to GHCR after the `check` workflow succeeded;
  it requires an exact `vMAJOR.MINOR.PATCH` tag at the pushed commit and tags the
  images with the version, the version without `v`, the commit SHA and `latest`
  on `main`.
- `specs/01-rbac.md`: filled RBAC slice (chapters 3 + 4.1) — role model, effective
  permission rule, 37-key catalog, role–permission matrix and the RBAC tables,
  taken from `PLAN.md` §5/§6.
- WP-M1-05: permission catalog of 37 keys plus `DEFAULT_ROLES` for the five system
  roles in `packages/shared/src/permissions.ts`; RBAC tables `roles`,
  `permissions`, `role_permissions`, `user_roles`, `user_permissions` with
  migration `0001_rbac_tables` and the `protect_system_roles()` trigger that
  blocks `DELETE` of system roles.
- WP-M1-05: idempotent seed `apps/api/src/db/seed-rbac.ts`
  (`npx tsx src/db/seed-rbac.ts`) — upserts the catalog and the five system roles,
  rewrites their grants, leaves custom roles and `user_permissions` untouched.
- WP-M1-05: catalog/`DEFAULT_ROLES` unit tests and the integration spec
  `apps/api/src/db/__tests__/rbac.integration.spec.ts`; the CI `check` job now
  provides PostgreSQL 16 as a service, so the database integration tests run
  instead of skipping.
- WP-M1-06: Argon2id password hashing in `apps/api/src/auth/password.ts`
  (`hashPassword`, `verifyPassword` — a malformed stored hash never throws) with
  the `argon2` library, whose prebuilds cover glibc and musl, so the
  `node:22-alpine` API image needs no compiler toolchain.
- WP-M1-06: idempotent bootstrap administrator `apps/api/src/db/seed-base.ts`
  (`npx tsx src/db/seed-base.ts`) from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`,
  linked to the system role `admin`; existing accounts keep their password hash,
  locale and `active` flag, and the CLI output never contains an e-mail or a
  password. `SEED_ADMIN_*` is validated as a pair (valid e-mail, password of at
  least 12 characters) and documented in `.env.example`; seed order is
  migrate → `seed-rbac` → `seed-base`.
- WP-M1-06 (plan): the legacy WP-M1-06 scope was split — the `objects`, `systems`,
  `text_templates` tables and the demo data moved to the new
  `work-packages/m2/00-core-tables-seed.md` (WP-M2-00, phase 2 per `PLAN.md` §16),
  and WP-M2-01 now depends on it.
- `specs/01-rbac.md` §3.6: session and `me` endpoint decisions for WP-M1-07, taken
  from `PLAN.md` §4 (Auth) and §15 (Security) — cookie name/attributes, token hash
  in `sessions.token_hash`, single `401` for unknown e-mail/wrong password/inactive
  accounts, login rate limit, delete-on-read of expired rows, the `me` payload and
  the phase 1 CSRF stance.
- WP-M1-07 (plan): the legacy auth package was rewritten into the small-model format
  and split, because it would have written six source files (`PLAN.md` §17 allows
  3–4): **WP-M1-07** keeps the shared login/me schemas and the session core, the new
  **WP-M1-07b** (`work-packages/m1/07b-auth-routes.md`) holds the session plugin, the
  `requireUser` preHandler and the login/logout/me routes. WP-M1-08 now depends on
  WP-M1-07b and references §3.2/§3.6 instead of the non-existent §3.7.
- WP-M1-07: session core `apps/api/src/auth/session.ts` — the cookie holds a 256-bit
  base64url token, the database holds only its SHA-256 hash in `sessions.token_hash`;
  `createSession`, `loadSession`, `destroySession`, `loadUserRoleKeys` (role keys read
  per request) and `sessionCookieOptions` from `COOKIE_SECURE`/`COOKIE_SAME_SITE` with
  `httpOnly` always on. Expired rows are deleted on read, and a session of a
  deactivated account is no session at all.
- WP-M1-07: shared auth schemas `packages/shared/src/schemas/auth.ts` —
  `loginRequestSchema` (normalized e-mail, capped password length) and
  `meResponseSchema` (`id`, `email`, `locale`, role keys); unit tests for token, hash
  and cookie attributes, plus the integration spec for create/load/expiry/logout,
  inactive account and role keys.
- WP-M1-07b: auth HTTP layer in `apps/api/src/auth/` — `sessionPlugin.ts` decorates
  `request.user` from the `session` cookie (`onRequest`, roles read per request) and
  exports the preHandler `requireUser` (`401` `session_invalid`); `routes.ts` serves
  `POST /api/v1/auth/login` (Argon2id verify, decoy hash for unknown e-mails so the
  response time does not leak accounts, one `401 invalid_credentials` for unknown,
  wrong-password and deactivated logins, route-level rate limit `5` per minute and
  IP), `POST /api/v1/auth/logout` (`204`, session row deleted, cookie cleared) and
  `GET /api/v1/me`. `src/index.ts` owns the database pool (`onClose` releases it),
  registers the plugin and the routes, and maps thrown envelope errors to
  `{ code, params }` — `@fastify/rate-limit` throws the builder result, so the
  `429 rate_limited` body needs that handler. New API dependency `fastify-plugin`.
- `specs/01-rbac.md` §3.7: permission guard decisions for WP-M1-08 — the effective
  permission service (role union plus allows minus denials, denial wins), the
  per-request cache, `requirePermission` with OR semantics and its `401`/`403`
  codes, the `permissions` array in `/me`, and the probe route that is registered
  only when `NODE_ENV=test`.
- WP-M1-08 (plan): the legacy guard package was rewritten into the small-model
  format (`work-packages/m1/08-require-permission.md`) — it now names its four
  source files (guard, `/me` route, `index.ts`, shared `me` schema), the read set,
  the interfaces and the required test cases.
- WP-M1-09 (plan): the legacy admin UI package was rewritten into the small-model
  format and split. WP-M1-09 now covers only the admin user API; the role API,
  `usePermission`, the admin users UI and the admin roles UI become follow-up
  packages WP-M1-09b–WP-M1-09d.
- WP-M1-08: effective permissions and the only enforcement point of the API in
  `apps/api/src/auth/requirePermission.ts` — `loadEffectivePermissions` resolves
  the union of the role permissions plus the explicit `allow` rows of
  `user_permissions` and drops every key with a `deny` row (denial wins,
  `specs/01-rbac.md` §3.2) as two queries, returning sorted catalog keys through
  `isPermissionKey`. `effectivePermissions(request, database)` caches that promise
  on the request, so several guards in one request mean one resolution while a
  role or permission change still acts without a new login.
- WP-M1-08: `requirePermission(database, ...keys)` preHandler factory with OR
  semantics — `401 { code: 'session_invalid' }` without a session (authentication
  before authorization), `403 { code: 'forbidden', params: {} }` without a
  matching key, unknown keys never match. `permissionProbeRoutes` registers
  `GET /api/v1/_test/require-permission/:keys` (comma-separated keys) in
  `src/index.ts` only when `NODE_ENV=test`; verified `404` in development.
- WP-M1-08: `meResponseSchema` gains the effective `permissions` array, so login
  and `GET /api/v1/me` answer role keys plus permission keys; the integration spec
  `apps/api/src/auth/__tests__/requirePermission.integration.spec.ts` covers
  anonymous `401`, admin role, a user without any role `403`, OR semantics through
  an explicit allow, an explicit denial beating the whole admin union, the sorted
  `permissions` in `/me` and an unknown key.
- WP-M1-09: admin users API in `apps/api/src/admin/users.ts` —
  `GET /api/v1/users` answers user summaries with role keys,
  `POST /api/v1/users` creates a normalized account with an Argon2id hash and
  inserts the requested `user_roles` links in one transaction, and
  `PATCH /api/v1/users/:id` updates locale, active flag, password hash and role
  links. The routes are guarded by `user.read` or `user.write`; duplicate e-mail
  answers `409 email_taken`, unknown role keys answer `422 unknown_role_key`, and
  the last active `admin` cannot be deactivated or un-roled. Shared user Zod
  schemas live in `packages/shared/src/schemas/user.ts`; the integration spec
  `apps/api/src/admin/__tests__/users.integration.spec.ts` covers permission
  guards, list/create/update responses, duplicate handling and the last-admin
  lockout guard.

### Changed

- WP-M1-08: `POST /api/v1/auth/login` answers the same user object as
  `GET /api/v1/me` — the shared `meResponseSchema` now requires `permissions`, so
  the UI needs no second round trip to know what to show.
- Language rule tightened: code, comments, test names, commit messages and
  developer documentation are English; the app stays multilingual (`de` default,
  `en` complete) and UI text uses i18n keys only.
- README and `AGENTS.md` switched to English.
- Default image build context is now the local checkout (`.`). Deployment panels
  that clone the repository themselves set `IMAGE_BUILD_CONTEXT` to the Git URL.
- The web container no longer waits for a healthy API, so the UI is reachable
  even while the API is starting or failing.
- The emergency notice uses 112 only; no other emergency number is part of the
  product text.
- The production stack publishes only the web port (`WEB_PORT`): `api` and `db`
  stay on the internal `backend` network, so they cannot collide with ports of
  other projects on the same Docker host. `API_PUBLISHED_PORT` and
  `API_BIND_ADDRESS` apply to the debug override only.

### Fixed

- WP-M0-05: the Docker smoke test no longer treats the internal `expose: 3000`
  of the API as a published host port; only a non-empty public port from
  `docker compose port` fails the guard.
- WP-M0-05: version tags are now annotated, so `git push --follow-tags`
  actually publishes them and the `build and push` workflow can resolve the
  version of the pushed commit.

### Deviations

- WP-M1-01: `npm run check` uses per-workspace typechecks instead of a single
  `tsc --noEmit` across all packages (see `AGENTS.md`); ESLint uses a flat config
  (`eslint.config.js`) instead of `.eslintrc.cjs`.
- WP-M1-03: the first migration uses drizzle-kit's number `0000` instead of
  `0001`; exactly one migration exists.
- WP-M0-04: the acceptance command `sh scripts/docker-smoke.sh` was not executed
  locally because the development container has no Docker; verified with `sh -n`
  and `npm run check`, the CI job `docker-smoke` runs the real smoke test.

### Not implemented (by design)

- All domain logic (tickets, objects, on-call, notifications, UI).
  Implementation happens only as a work package from `work-packages/` — so far
  WP-M1-01 to WP-M1-07b (foundation, base data model, RBAC, seeds, session core and
  the auth HTTP layer) are implemented.
