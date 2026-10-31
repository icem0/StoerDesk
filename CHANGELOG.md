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
- WP-M1-09b: admin role API in `apps/api/src/admin/roles.ts` —
  `GET /api/v1/roles` (`role.read`) answers every role with `isSystem`, its sorted
  `permissionKeys` and `userCount`, `POST /api/v1/roles` creates a custom role
  (`is_system = false`) with de-duplicated catalog keys,
  `PATCH /api/v1/roles/:key` replaces the grant set and `DELETE /api/v1/roles/:key`
  removes an unused custom role (`role_permissions` cascade). The write routes are
  guarded by `role.write`; unknown permission keys answer
  `422 unknown_permission_key`, an existing or reserved key `409 role_key_taken`, a
  seeded system role `409 system_role_protected` (the service-level guard of
  `specs/01-rbac.md` §3.5, the DB trigger stays the backstop) and a role still held
  by users `409 role_in_use`. Shared role schemas live in
  `packages/shared/src/schemas/role.ts`, `specs/01-rbac.md` gained §3.8; the
  integration spec `apps/api/src/admin/__tests__/roles.integration.spec.ts` covers
  the guards, the seeded grant counts, create/replace/delete, the protected system
  roles and that a replaced grant set acts in `GET /api/v1/me` without a new login.
- WP-M1-10e: follow-up closure rule — `AGENTS.md` gained the section
  _Open follow-ups (mandatory closure)_ (a split creates its child WP files in the
  same commit, open items are collected with
  `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/` before a WP
  starts and are implemented in numeric order before the next phase), `PLAN.md` §16
  gained the subsection _Current state and open backlog_,
  `work-packages/README.md` gained the `Open follow-ups` table as the backlog of
  record, and `docs/WP-TEMPLATE.md` gained the `status:` field plus the split-child
  handoff rule. This closes the hole that let WP-M1-09b–WP-M1-09d be overtaken by
  WP-M1-10, WP-M1-10b and WP-M1-10c.
- WP-M1-09c: admin users UI in `apps/web/src/admin/users-page.tsx` —
  `UsersPage` at route `/admin/users` lists users (e-mail, locale, active state,
  role keys) for `user.read` and offers a create form plus per-row editing
  (locale, active, role keys, optional new password) for `user.write`, using the
  role list of `GET /api/v1/roles` for the checkboxes. `apps/web/src/auth/usePermission.ts`
  adds `useMe` (query on `['me']`) and `usePermission` with the OR semantics of the
  server guard; hiding is cosmetic, the API stays the enforcement point. `apiFetch`
  parses the `{ code, params }` error body into `ApiError`, so `email_taken`,
  `last_admin` and the other codes map to `settings:admin.users.errors.*` keys.
  All page text lives in the `settings` namespace (de and en complete).
- WP-M1-09d: admin roles UI in `apps/web/src/admin/roles-page.tsx` — `RolesPage` at route
  `/admin/roles` lists roles (key, system or custom, permission count, user count) for
  `role.read`; `role.write` adds a create form (key plus the `PERMISSION_KEYS` checkbox
  grid), a per-row grant editor PATCHing `/api/v1/roles/:key` and a delete button, while
  seeded system roles stay read-only because the seed rewrites their grants. `apiFetch`
  answers `204 No Content` with `undefined` instead of throwing on the empty body, so
  `DELETE /api/v1/roles/:key` works. The role error codes map to
  `settings:admin.roles.errors.*` keys (de and en complete). The announced follow-up
  WP-M1-09e got its work-package document
  `work-packages/m1/09e-login-form-guard.md`.
- WP-M1-09e: session UI in `apps/web/src/auth` — `LoginForm` posts `/api/v1/auth/login` through
  `useMutation` + `apiFetch<MeResponse>` and writes the response into the `['me']` cache, so the
  guarded area swaps without a second round-trip; unknown e-mail, wrong password and a
  deactivated account all render the same `common:auth.errors.invalid_credentials` notice
  (no account enumeration), a `429` renders `rate_limited`. `LogoutButton` posts
  `/api/v1/auth/logout` and invalidates `['me']`, `['users']` and `['roles']`.
  `RequireSession({ children })` is the parent route of both `/admin/*` routes: loading text
  while `/me` is pending, the login form while it answers `401`, otherwise the children —
  cosmetic only, `requirePermission` stays the enforcement point. `App.tsx` shows the
  signed-in e-mail, the admin links and the logout button. All strings live in the `common`
  namespace under `auth.*` (de and en complete: 80 keys each).
- WP-M1-12: Playwright smoke E2E — `apps/web/e2e/auth.spec.ts` runs the phase 1 exit
  criterion "login as admin works" in Chromium, once with the German UI and once with the
  English one: login form of the seeded bootstrap administrator, the signed-in shell,
  `GET /api/v1/me` answering role `admin` plus `user.read`, and `/admin/users` with the
  seeded row and its role cell. `apps/web/playwright.config.ts` starts the API and the Vite
  dev server (only the dev server proxies `/api`; the nginx path is the Docker smoke test)
  on the E2E-only ports 3174/5174. `scripts/e2e-check.mjs` creates the throwaway database
  `stoerdesk_e2e_<run>` from `TEST_DATABASE_URL`, runs the migrations and both seeds against
  it, runs Playwright and drops it again; missing prerequisites produce one notice and a
  green gate locally, in CI (`CI=true`) they are an error. `npm run test:e2e` is the last
  gate of `npm run check`, and the `check` job installs Chromium with
  `npx playwright install --with-deps chromium` — no extra CI job, because that job already
  provides the Postgres-16 service. `E2E_CHROMIUM_PATH` selects a distribution browser in
  containers that cannot run the bundled build.
- WP-M1-13: UI layout shell — `apps/web/src/components/Shell.tsx` wraps the app in a sticky
  header (app title, signed-in account, logout button), a left navigation with the admin
  routes and a centred main area; the shell shows the login form while `/me` answers `401`.
  `App.tsx` renders the shell, the admin routes are nested below `/` so the shell wraps them,
  and the shell reuses the existing `common` keys (`app.title`, `auth.signedInAs`,
  `auth.links.*`) — no locale file changed.
- WP-M1-14: the base seed keeps an existing administrator untouched again — the bootstrap
  insert uses `onConflictDoNothing` on `users.email` and the status `created`/`existing` is
  decided by looking the user up before the insert. The Argon2id hash is only computed when
  a row is really inserted. The role link to `admin` is still repaired on every run.
- WP-M2-00: core object tables — migration `0002_core_object_tables` adds `objects`
  (user-input `object_no`, unique over `lower(object_no)`, address, contact, nullable
  `qr_token`, `external_id`, `active`, `notes`), `systems` (object FK with `ON DELETE
  CASCADE`, type check over `BMA`/`LICHTRUF`/`RWA`/`EMA`/`SPRACHALARM`/`SONSTIGE`, own
  optional `qr_token`), `text_templates` and `text_template_translations` (composite key,
  `de`/`en` check) with the indexes of `specs/02-data-model.md` §4.6.
- WP-M2-00: demo seed `apps/api/src/db/seed-demo.ts` (`npx tsx src/db/seed-demo.ts`) —
  three example objects with one `BMA` system each plus the nine standard text templates
  from the new localized resource `STANDARD_TEXTS` in `packages/shared/src/seed/`;
  idempotent over the natural keys and never overwrites edits, the CLI prints counts only.
- `specs/02-data-model.md` is filled from `PLAN.md` §6 and reviewed: the object list is the
  maintained table, `object_no` is user input, unique case-insensitively, format
  `^[A-Z0-9][A-Z0-9_-]{0,31}$` (e.g. `12345_01`), tickets link by UUID foreign key, and
  external referencing (CSV, object API, stickers) uses `object_no`.
- WP-M2-01: object list CRUD API — `apps/api/src/objects/service.ts` serves
  `GET /api/v1/objects` (search plus the `active`/`city`/`systemType` filters),
  `GET /api/v1/objects/:objectNo`, `POST`, `PATCH /:objectNo` and `DELETE /:objectNo`
  (soft delete, `active = false`). Guards are `object.read`, `object.write` and
  `object.delete`; systems are synced by id; duplicate object numbers answer
  `422 object_no_taken`. The shared Zod schemas live in
  `packages/shared/src/schemas/object.ts`, and `specs/08-objects-api.md` §9.1 is filled
  from `PLAN.md` §11.
- WP-M2-02: QR tokens — `POST /api/v1/objects` now generates a 22-character
  `base64url` token, migration `0003_old_qr_tokens` adds `old_qr_tokens`
  (`token` unique, `expires_at`, object FK cascade),
  `POST /api/v1/objects/:objectNo/regenerate-qr` rotates it and retires the old
  token for 30 days (`blockOldToken: true` blocks it immediately), and the public
  `GET /api/v1/public/qr/:token` resolves current and retired active tokens for
  the web route `/m/:token`. `apps/api/src/objects/qr.ts` owns the routes and
  `generateQrToken()`; the object summary carries `qrToken`. The daily pg-boss
  cleanup and the demo-seed token backfill are WP-M2-02b.

### Changed

- WP-M1-12: `apps/web/src/i18n/index.ts` reads the stored language preference
  (`i18nextLng`, only `de`/`en`) as the initial language, with `de` still the default and
  the reference locale and a broken storage never breaking init. Without it the `en` bundle
  was unreachable in a running app, so no English test could exist; a later language
  switcher UI writes exactly this key. `npm run check` gained the sixth gate `test:e2e`, and
  the `check` job step is named `Quality gates (typecheck, lint, tests, i18n, wp, e2e)`.
- WP-M1-10f (completed): `build.yml` closes the CI naming rule — `permissions:
actions: write`, the job `Resolve version tag` gained the guarded step
  `Name the run after the version` (`gh api --method PATCH` renames the run to
  `publish <version>`, `continue-on-error: true`), the publish jobs are named
  `Publish <service> image <version>`, the step `Build and push image` and the new
  `Write image summary` step write image names, tags, version, source SHA and
  source run URL into the job summary. `AGENTS.md` states the run-naming rule and
  `CONTRIBUTING.md` speaks of `publish images`.
- WP-M1-10f (partial): CI runs are self-describing now. `check.yml` gained
  `run-name: check · <ref> · <event>` and the step names `Quality gates
(typecheck, lint, tests, i18n, wp)` and `Build web and API artifacts (no publish)`.
  `.github/workflows/build.yml` is displayed as **publish images** instead of
  `build and push` and gained `run-name: publish images · <event> · <source branch>`.
  The first attempt used `${{ substring(github.sha, 0, 7) }}` in both labels — GitHub
  Actions has no `substring()` function, so the push produced four runs named after the
  workflow file that failed instantly with zero jobs; the labels carry no short SHA now.
  GHCR image names and the tag set are unchanged; the run rename to `publish <version>`,
  the publish job/step names and the image run summary are still open
  (see `work-packages/m1/10f-ci-run-naming.md`).
- CI housekeeping (no work package): the `playwright` job of `check.yml` was removed —
  the repository has no `playwright.config` and no E2E spec, so the job only re-ran the
  web unit tests with an installed Chromium. It comes back with WP-M1-12. All publish
  runs now share one serialising concurrency group (`publish-queue`), so a slower build
  of an older commit can no longer overwrite `latest`.
- WP-M1-10g (superseded by WP-M1-10h): attempted to version the run names by letting
  `check.yml` rename its own run through `gh api --method PATCH
actions/runs/<run_id>`. It never took effect: the run stayed `check · main · push` and
  the publish run inherited that plain title as `publish check · main · push · main`
  (runs 41034256724 and 41034380131). Two wrong assumptions — see WP-M1-10h.
- WP-M1-10h: the quality gates hang on the version tag. **A workflow run cannot be renamed
  at all**: the REST reference of the workflow-runs API lists rerun, cancel, delete, logs,
  approvals and timing only, and the PATCH call of WP-M1-10g answers `404` (hidden by
  `continue-on-error: true` since WP-M1-10f). A label therefore has to be right when the run
  starts, and the only payload carrying the version is a tag push — which `git push
--follow-tags` produces for every commit. `check.yml` triggers on
  `push: tags: ['v[0-9]*']` (plus `pull_request` and `workflow_dispatch`) instead of
  `push: branches: [main]`, its `run-name` is `github.ref_name` so the run is titled
  `v0.0.NN`, and the dead `Resolve version tag` rename job plus `actions: write` are gone.
  `build.yml` drops the `branches: [main]` filter of its `workflow_run` trigger, gates the
  version job on `workflow_run.event == 'push'` so pull request runs never publish, and its
  `run-name` is `publish <title of the calling check run>` → `publish v0.0.NN`. Consequence:
  a commit pushed without its tag gets no quality-gate run, so the one-tag-per-commit rule
  is now a build precondition in `AGENTS.md`.
- WP-M1-10i: the publish run label says what is new. A `workflow_run` payload only carries
  the title of the calling run, so `publish v0.0.NN` was the ceiling, and no Actions
  expression can turn `head_commit.message` of a tag push into one line (that field is the
  whole multiline commit message — verified through the Actions API: the runs of `v0.0.49`
  and `v0.0.50` carry the commit SHAs `b13e9d4`/`ca4c948` as `head_sha`, while the annotated
  tag objects are different SHAs). The green `check` run of a tag now ends with the job
  `Dispatch publish run`, which posts a `workflow_dispatch` event for `build.yml` with the
  inputs `version`, `notes` (the commit subject), `source_run` and `mode=check` — the only
  payload that carries usable free text. `build.yml` triggers on `workflow_dispatch` alone,
  titles itself `publish <version> · <notes>` (manual runs:
  `publish <version> · manual · <ref>`), checks that the tag at HEAD equals the requested
  `version`, and moves `latest` only for `mode=check`. Side effect: the empty `publish
images` runs of finished pull request runs are gone, and the check↔publish link now lives
  in the `source_run` input and both job summaries. Lesson from the first push: a job
  without `runs-on` fails the Actions schema and with it the whole file — the run then has
  zero jobs, is titled with the workflow path and ignores its trigger filters, so one
  `git push --follow-tags` produced two failed `check` runs. `js-yaml` only validates YAML
  syntax, so the fix push was preceded by a `js-yaml` pass over both workflows that asserts
  `runs-on`, a non-empty `steps` list and resolvable `needs` for every job.
- WP-M1-11: `docs/REPO-MAP.md` is English and current through phase 1, which closes the
  deviation note that WP-M1-10, WP-M1-10c and WP-M1-10d carried. The tree now shows the
  folders phase 1 actually created (`apps/web/src/{admin,auth,lib,routes}`,
  `apps/api/src/{admin,auth,config,notifications}`) and marks the folders that are still
  empty on purpose (`components/`, `features/*`, `tickets|objects|oncall|stats|jobs`). The
  module table gained the rows that were missing: `apps/api/src/index.ts` (`buildServer` with
  the `{ code, params }` error envelope and `/api/v1/health`),
  `packages/shared/src/schemas/user.ts`, `packages/shared/src/i18n/t.ts`,
  `apps/web/src/routes/index.tsx`, `apps/web/src/App.tsx` and `main.tsx`,
  `apps/api/drizzle.config.ts`, `apps/api/scripts/copy-migrations.mjs`, the Husky hooks with
  the one-tag-per-commit rule, the three Compose overrides, the ADR files and the governance
  documents. The map is 168 lines (limit 200) and the legacy WP document
  `work-packages/m1/11-repo-map.md` was rewritten into the small-model format.
- WP-M1-10d: `docs/DECISIONS.md` and the ADRs are English, as the language rule of
  `AGENTS.md` requires. The index titles the records "Monorepo with npm workspaces" and
  "UUID v7 as the database primary key", the template block asks for `Status`, `Date` and
  `Stakeholders` above `Context`, `Decision`, `Alternatives` and `Consequences`, and
  ADR-0002 keeps every technical statement: Postgres 16 has no `uuidv7()` (that arrives
  with Postgres 18), migration `0000_base_tables` provides `gen_uuid_v7()` (48-bit
  millisecond timestamp, version 7, RFC 9562 variant bits, random remainder) written as
  `CREATE OR REPLACE` and declared `VOLATILE`, the four rejected alternatives, and the
  caveat that the ticket timeline follows event timestamps and event sequences rather than
  IDs. The English slugs and the ADR-0001 translation had already landed in the
  work-in-progress commit `b573fb5`, so the German remainder was the index, the template
  and ADR-0002. `docs/REPO-MAP.md` shrinks its deviation note to the map itself, which
  WP-M1-11 normalizes.
- WP-M1-10c: the four `docs/` placeholders `ARCHITECTURE.md`, `COMPLIANCE.md`,
  `GLOSSARY.md` and `I18N.md` are English now, as the language rule of `AGENTS.md`
  requires. `ARCHITECTURE.md` separates what is live (`/api/v1/health`, the auth
  routes, the admin users routes) from what is still planned (public report route,
  ticket state machine, notification outbox, pg-boss jobs, Dexie working copy), the
  permission source of truth is corrected to `packages/shared/src/permissions.ts`,
  and the locale table states `de` as default and reference while `en` must be
  complete.
- WP-M1-10: `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` are English
  now, and `CODE_OF_CONDUCT.md` carries the full Contributor Covenant 2.1 text
  instead of a paraphrase; the last German step name in
  `.github/workflows/check.yml` is English too. `SECURITY.md` no longer points at a
  `SECURITY_CONTACT` variable that `.env.example` does not define — the reporting
  channel is the operator of the instance or a private GitHub report.
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

- WP-M1-14: the base seed broke the contract of `work-packages/m1/06-seeds-base.md` §4 in
  commit 82a9fc7 — a re-run overwrote the `password_hash` of an existing administrator,
  although the seed must never reset a changed password, and the status was derived from
  `inserted.length === 1`, which PostgreSQL `RETURNING` also reports for an upsert, so the
  second run claimed `created` instead of `existing`. The failing assertion in
  `seed-base.integration.spec.ts` encoded the specified behaviour. This fixes the red
  `check` runs v0.0.58 … v0.0.61.
- WP-M0-05: the Docker smoke test no longer treats the internal `expose: 3000`
  of the API as a published host port; `docker compose port` reports it as
  `:0`, so only a real non-zero public port fails the guard.
- WP-M0-05: version tags are now annotated, so `git push --follow-tags`
  actually publishes them and the `build and push` workflow can resolve the
  version of the pushed commit.
- WP-M1-10b: the three GitHub issue forms in `.github/ISSUE_TEMPLATE/` render as
  forms again — they had no closing front-matter delimiter and no nested
  indentation for `attributes` and `validations`, so GitHub showed them as plain
  text. The emergency notice in `bug.md` and `feature.md` names 112 only (no 110),
  and `.prettierignore` keeps Prettier from rewriting the form YAML.

### Deviations

- WP-M1-01: `npm run check` uses per-workspace typechecks instead of a single
  `tsc --noEmit` across all packages (see `AGENTS.md`); ESLint uses a flat config
  (`eslint.config.js`) instead of `.eslintrc.cjs`.
- WP-M1-03: the first migration uses drizzle-kit's number `0000` instead of
  `0001`; exactly one migration exists.
- WP-M0-04: the acceptance command `sh scripts/docker-smoke.sh` was not executed
  locally because the development container has no Docker; verified with `sh -n`
  and `npm run check`, the CI job `docker-smoke` runs the real smoke test.
- WP-M1-10b: while adding the `.github/ISSUE_TEMPLATE/` entry, the German
  drizzle-kit comment in `.prettierignore` was translated — `AGENTS.md` requires
  English everywhere.
- WP-M1-10c: the glossary names each term in English and keeps the German UI label in
  parentheses (`Objekt`, `Anlage`, `Rolle`), so the vocabulary of the German product
  text stays findable from English developer documentation.
- WP-M1-12: the bundled Playwright Chromium is a glibc build and cannot start in this
  Alpine (musl) development container, so the two tests ran locally against the
  distribution browser — `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`
  printed `2 passed` after `prepared throwaway database …` and `dropped throwaway
  database …`. Without that variable the runner prints its skip notice and `npm run check`
  stays green, which is why the CI job installs the browser and reports the real run.
- WP-M1-12: the legacy WP document `work-packages/m1/12-smoke-e2e.md` was rewritten into
  the small-model format, and its four-line task list gained the ten-line stored-language
  read in `apps/web/src/i18n/index.ts`: the acceptance demands an EN test, and the app had
  no path to the `en` bundle.

### Not implemented (by design)

- All domain logic (tickets, objects, on-call, notifications, UI).
  Implementation happens only as a work package from `work-packages/` — so far
  WP-M1-01 to WP-M1-12 (foundation, base data model, RBAC, seeds, session core,
  the auth HTTP layer, the permission guard, the admin users and roles APIs with their
  UI, the CI chain and the Playwright smoke test) are
  implemented.
