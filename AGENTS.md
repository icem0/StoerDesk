# AGENTS

Rules for every coding agent and developer working on **StörDesk**.

## Build plan anchor

**`PLAN.md` is the binding entry point.** Read it before any work package.
It contains the scope, stack decisions, phases, work-package limits and the
current open decisions. `specs/` holds the expanded slices; a spec slice wins
over `PLAN.md` only after it has been reviewed and contains real content.

If `PLAN.md` and an older work package disagree, stop and update the plan or the
work package first. Never implement a feature that has no work package.

## Current status

**Implemented so far: WP-M0-01, WP-M0-02, WP-M0-03, WP-M0-04, WP-M0-05
(Phase 0 complete) and WP-M1-01, WP-M1-02, WP-M1-03, WP-M1-04, WP-M1-05,
WP-M1-06, WP-M1-07, WP-M1-07b, WP-M1-08, WP-M1-09, WP-M1-09b, WP-M1-09c, WP-M1-09d,
WP-M1-09e, WP-M1-10, WP-M1-10b, WP-M1-10c,
WP-M1-10e, WP-M1-10f, WP-M1-10h** (WP-M1-10g was superseded by WP-M1-10h) plus the
CI follow-up **WP-M1-10i** (publish run title carries one line of "what is new"), the
documentation follow-up **WP-M1-10d** (English ADRs and decision index), the
documentation follow-up **WP-M1-11** (English, current repository map), the
phase 1 closing package **WP-M1-12** (Playwright smoke test "login as admin works"),
the UI package **WP-M1-13** (layout shell with header and navigation), the
seed fix **WP-M1-14** (the base seed keeps an existing administrator untouched) and the
version-display regression fix **WP-M1-15** (the shell header shows the build version on
the login screen and on every guarded page).
**Phase 1 is closed** — the `Open follow-ups` table of `work-packages/README.md` and
`PLAN.md` §16 hold no open phase 1 item anymore. **Phase 2 has started**:
`specs/02-data-model.md` is filled from `PLAN.md` §6 and reviewed (the `object_no`
decision is §4.3.1: user input, required, unique case-insensitively, `_` allowed, e.g.
`12345_01`), **WP-M2-00** is implemented, **WP-M2-01** provides the object
list CRUD API (`/api/v1/objects`, soft delete, search/filter and system sync) and
**WP-M2-02** adds QR generation, regeneration with retired tokens and public token
resolution, and its follow-up **WP-M2-02b** adds the demo-seed token backfill plus the
daily pg-boss cleanup of expired retired tokens. **WP-M2-03** adds the printable QR
sticker sheets of the web app (`/objects/stickers`, A6/A4 print view, the 112 notice on
every card) — rewritten from the legacy PDF plan, because `PLAN.md` §4/§11 make the
browser print path the primary one and a PDF download optional. **WP-M2-04** adds the
ticket schema behind migration `0004_ticket_tables` (`tickets` with the `next_ticket_no()`
default, the append-only `ticket_events`, `ticket_photos` and `ticket_no_counters`) —
rewritten from the legacy report-form plan and split, so its child **WP-M2-04b** adds the
public report endpoint `POST /api/v1/public/tickets` (idempotency over `client_uuid`, the
`422` form rules, the ±10 minute clock rule) and **WP-M2-04c** (photo upload) follows.
The repository contains:

- the binding build plan in `PLAN.md` and the expanded slices in `specs/`
  (placeholder chapters stay authoritative from `PLAN.md` until filled),
- the work plan in `work-packages/` (M0, M1, M2 — M0 and M1 finished, M2 started),
- the environment (monorepo, configuration, skeleton, CI, Docker, and the
  repeatable smoke test `scripts/docker-smoke.sh` run by the CI job `docker-smoke`),
- the image pipeline (`.github/workflows/build.yml`) that publishes the versioned
  `api` and `web` images to GHCR after the `check` workflow succeeded,
- the Drizzle base schema with migration `0000_base_tables` (`users`, `sessions`,
  `groups`, `user_groups`, `settings`; UUID v7 via `gen_uuid_v7()`, see ADR-0002),
- the i18n skeleton (web i18next setup + `locales/{de,en}`, shared server `t()`,
  `scripts/i18n-check.ts`, active `i18next/no-literal-string` lint rule),
- the RBAC layer (permission catalog and `DEFAULT_ROLES` in `packages/shared`,
  migration `0001_rbac_tables`, `seed-rbac.ts`/`seed-base.ts`, Argon2id hashing),
- the core object tables of WP-M2-00 (migration `0002_core_object_tables`:
  `objects` with user-input `object_no` unique over `lower(object_no)`, nullable
  `qr_token`, `systems` with the `BMA`/`LICHTRUF`/`RWA`/`EMA`/`SPRACHALARM`/
  `SONSTIGE` type check and an object FK `ON DELETE CASCADE`, `text_templates`
  plus `text_template_translations` with composite key and `de`/`en` check;
   `apps/api/src/db/seed-demo.ts` seeds three example objects with one `BMA` each
   and the nine localized `STANDARD_TEXTS` from `packages/shared/src/seed/`,
   idempotent over natural keys and never overwriting edits; every demo object it
   inserts carries a generated `qr_token` and a `NULL` token is backfilled
   (WP-M2-02b),

- the object list API of WP-M2-01 (`apps/api/src/objects/service.ts` plus the shared
  schemas in `packages/shared/src/schemas/object.ts`): `GET`, `GET /:objectNo`,
  `POST`, `PATCH /:objectNo` and `DELETE /:objectNo` under `/api/v1/objects`, guarded
  by `object.read`/`object.write`/`object.delete`; search over number, name, street,
  city and external id, filters `active`/`city`/`systemType`, systems synced by id,
  soft delete sets `active=false`, duplicate numbers answer `422 object_no_taken`,
- the QR token layer of WP-M2-02 (`apps/api/src/objects/qr.ts`, shared schemas, migration
  `0003_old_qr_tokens`): create generates a 22-character `base64url` token,
  `POST /:objectNo/regenerate-qr` (guarded by `object.regenerate_qr`) moves the old token
  to `old_qr_tokens` with `expires_at = now + 30 days` (`blockOldToken` blocks it now),
  and the public `GET /api/v1/public/qr/:token` resolves current/retired active tokens;
   object summaries carry `qrToken`,
- the scheduled cleanup of WP-M2-02b (`apps/api/src/jobs/qr-cleanup.ts`):
  `deleteExpiredQrTokens(database, now?)` deletes `old_qr_tokens` rows with
  `expires_at <= now`, and `startQrTokenCleanup(connectionString)` runs it through the
  pg-boss queue `qr-token-cleanup` on the cron `0 3 * * *` with one short-lived pool per
   job — started only in the direct-start block of `apps/api/src/index.ts` (never in
  `buildServer`) and stopped by an `onClose` hook,

- the printable QR stickers of WP-M2-03 (`apps/web/src/features/objects/sticker-page.tsx`):
  `StickerPage` at the guarded route `/objects/stickers` lists the active objects as a
  checklist (all selected, client-side search over number/name/city), switches between the
  A6 and the A4 sheet and prints through `window.print()`; every `StickerCard` carries the
  `qrcode.react` QR of `<origin>/m/<qr_token>`, the object name, the object number, the
  report call and the 112 notice (`object:sticker.emergencyNotice`), and a `NULL` token
  prints `object:sticker.noToken` instead of a QR; the mm geometry is in
  `apps/web/src/styles.css`, the selected format writes one `@page` rule and header, nav,
   toolbar and checklist are `print:hidden` — no API route, no PDF endpoint,

- the ticket schema of WP-M2-04 (migration `0004_ticket_tables`): `tickets` with
   `ticket_no` default `next_ticket_no()` (`ST-<year>-NNNN` over the per-year row in
   `ticket_no_counters`), object FK `ON DELETE RESTRICT`, system FK `ON DELETE SET NULL`,
   checks over `NEW`…`CANCELLED` / `low`…`critical` / `QR`/`INTERNAL`/`API`, unique
   `ticket_no`, `client_uuid` (idempotency) and `status_token`, plus the `parent_ticket_id`
   self FK; `ticket_events` is append-only through the trigger
   `ticket_events_is_append_only` (a direct `UPDATE`/`DELETE` raises
   `ticket_event_append_only`, the ticket's own cascade passes on
   `pg_trigger_depth() > 1`);    `ticket_photos` stores the metadata of the upload volume
   with a `image/jpeg`/`image/png` check — no route and no shared schema yet
   (WP-M2-04b/WP-M2-04c),

- the public report endpoint of WP-M2-04b (`apps/api/src/tickets/report.ts` plus the
   schemas in `packages/shared/src/schemas/ticket.ts`): `POST /api/v1/public/tickets`
   without auth answers `201` for a new report and `200` for a repeat of the same
   `client_uuid` (unique index, `ON CONFLICT DO NOTHING`), `404 qr_token_not_found` for
   an unknown, inactive or retired token, and `422` with `report_text_required`,
   `contact_required` or `system_not_found`; `reported_at` is the device time unless it
   deviates by more than ten minutes (`clock_skewed`), `deadline_at` is that base plus
   72 h, `status_token` is generated with the ticket through `generateQrToken()`, and one
   append-only `created` event (actor kind `public`, payload with locale, source,
   template keys and text length) is written in the same transaction — no photo field
   (WP-M2-04c) and no per-IP/per-token rate limit (WP-M2-07),

- the auth HTTP layer (`apps/api/src/auth/session.ts`, `sessionPlugin.ts`,
  `routes.ts`: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
  `GET /api/v1/me`; sessions as random tokens with a SHA-256 hash in `sessions`),
- the permission guard (`apps/api/src/auth/requirePermission.ts`:
  `loadEffectivePermissions` = role union plus explicit allows minus explicit
  denials, cached per request; `requirePermission(database, ...keys)` with OR
  semantics — `401 session_invalid` for anonymous calls, `403 forbidden` without a
  match; `login` and `/me` return the `permissions` keys; the probe route
  `/api/v1/_test/require-permission/:keys` exists only when `NODE_ENV=test`),
- the admin users API (`apps/api/src/admin/users.ts`: `GET`, `POST` and
  `PATCH /api/v1/users`, guarded by `user.read` or `user.write`; shared user
  schemas in `packages/shared/src/schemas/user.ts`; Argon2id password hashing on
  create/update, transactional role assignment, duplicate e-mail and unknown role
  key errors, and a guard that does not deactivate or un-role the last active
  admin),
- the admin roles API (`apps/api/src/admin/roles.ts`: `GET /api/v1/roles` plus
  `POST`, `PATCH` and `DELETE /api/v1/roles/:key`, guarded by `role.read` or
  `role.write`; shared role schemas in `packages/shared/src/schemas/role.ts`; only
  custom roles are writable — seeded system roles answer `409` with
  `system_role_protected`, a role still held by users `409 role_in_use`, an unknown or
  reserved key `409 role_key_taken`, a key outside the catalog `422` with
  `unknown_permission_key`),
- the admin UI (`apps/web/src/auth/usePermission.ts`: `useMe` on `['me']` plus
  `usePermission(...keys)` with the OR semantics of the server guard — hiding controls is
  cosmetic only; `apps/web/src/admin/users-page.tsx`: `UsersPage` at `/admin/users`;
  `apps/web/src/admin/roles-page.tsx`: `RolesPage` at `/admin/roles` with the role table
  (grant counts, user counts), create/edit/delete for custom roles, a `PERMISSION_KEYS`
  checkbox grid and seeded system roles read-only; all texts from the `settings` namespace,
  `apiFetch` answers `204` with `undefined`),
- the session UI (`apps/web/src/auth/login-form.tsx`: `LoginForm` posts
  `/api/v1/auth/login` and writes the `MeResponse` into the `['me']` cache, `LogoutButton`
  posts `/api/v1/auth/logout` and invalidates `['me']`/`['users']`/`['roles']`;
  `apps/web/src/auth/require-session.tsx`: `RequireSession` shows loading text, the login form
  or the children — both `/admin/*` routes are children of that guarded route; `App.tsx`
  shows the signed-in e-mail, the admin links and the logout button; unknown credentials,
  wrong password and an inactive account all render the same `common:auth.errors.invalid_credentials`
  notice, `429` renders `rate_limited`),
- the documentation in `docs/`: `ARCHITECTURE.md`, `COMPLIANCE.md`, `GLOSSARY.md`, `I18N.md`
  and the decisions (`DECISIONS.md` with the index and the ADRs `DECISIONS/0001` and
  `DECISIONS/0002`) are English, and `REPO-MAP.md` is English too — its structure tree, its
  module table (one row per module: purpose plus public API) and its status section describe
  the state after WP-M1-12 and are updated after every work package,
- the smoke E2E (`apps/web/e2e/auth.spec.ts` plus `apps/web/playwright.config.ts`): Chromium
  logs in as the seeded administrator in German and in English, asserts `GET /api/v1/me`
  with role `admin` and opens `/admin/users`. `scripts/e2e-check.mjs` creates the throwaway
  database `stoerdesk_e2e_<run>` (`TEST_DATABASE_URL`, fallback `DATABASE_URL`), runs
  migrations and both seeds into it, runs Playwright and drops it again; `npm run test:e2e`
  is the last gate of `npm run check`, and the `check` CI job installs Chromium because that
  job already provides the Postgres-16 service.

Further domain logic (tickets, objects, on-call, notifications, UI) is created only as
the implementation of a work package from `work-packages/` — package by package,
never in bulk.

## Architecture

- **Monorepo** with npm workspaces: `apps/*`, `packages/*`.
- **Web** (`apps/web`): React + Vite PWA, i18next, TanStack Query, Tailwind, Dexie.
  Mobile-first and offline-capable; installable as a PWA.
- **API** (`apps/api`): Fastify + Drizzle + PostgreSQL + pg-boss.
  The database is the source of truth; tickets run through a state machine,
  notifications through an outbox, scheduled tasks through pg-boss jobs.
- **Shared** (`packages/shared`): Zod schemas, types, permission constants,
  i18n resources. No build step of its own — source package.

## Conventions

- **Language — English everywhere.** Code, identifiers, comments, JSDoc, test names,
  error and log messages, commit messages, and developer documentation are English.
  The repository itself (README, `AGENTS.md`, `docs/`) is English as well.
  User-facing text is the only exception: it is multilingual and never hard-coded —
  always via i18n keys (see the i18n section).
- **Errors**: `{ code, params }` — never translated text in logs or API payloads.
- **Logging**: Pino, structured, no PII in plain text.
- **Money amounts**: none — StörDesk does not track amounts (unlike warehouse projects).
- **IDs**: UUID (UUID v7 as the database default), no sequential numbers.
- **Timestamps**: server time is authoritative.
- **Types**: TypeScript strict. No `any` (warning), no untyped code.
- **Tests**: Vitest for unit/integration, Playwright for E2E.

## Data model lessons (from the specification)

- **Stock logic**: not applicable — StörDesk manages no stock.
- **Changes stay traceable**: ticket events are immutable, corrections are new
  events (audit trail).
- **Quarantine**: sync errors that cannot be resolved automatically are isolated
  and never block processing.

## Quality

Run after every change:

```bash
npm run check
```

Which covers:

1. `npm run typecheck --workspaces --if-present` — TypeScript per workspace
   (web and API keep separate `tsconfig.json` files because they need different libs).
2. `eslint .` — flat config in `eslint.config.js`.
3. `vitest run` — one Vitest project per workspace.
4. `npm run i18n:check` — de/en key parity and referenced keys.
5. `npm run wp:check` — work-package size, context budget and required fields.
6. `npm run test:e2e` — Playwright smoke test on a throwaway database (`WP-M1-12`);
   without a reachable database or without a startable browser it prints one notice and
   stays green locally, but in CI (`CI=true`) a missing prerequisite is an error.

Additionally when needed:

```bash
npm run build      # build web + API
npm run format     # Prettier
```

**Deviation from WP-M1-01**: the root `check` script uses the per-workspace typechecks
instead of a single `tsc --noEmit` across all packages, because the API (Node) and
web (DOM) need different `lib` sets. The root `tsconfig.json` remains for editor
and IDE support.

## CI after push

- After a completed work package, commit with the Husky hooks and push with
  `git push --follow-tags`. Do not finish a WP with an unpushed commit.
- **Run names are fixed at the start (WP-M1-10h, note added by WP-M1-10i):** GitHub has no
  REST endpoint that renames a workflow run — the workflow-runs API offers rerun, cancel,
  delete, logs and timing only — so a label can never be corrected afterwards and the text
  has to be in the event payload when the run starts. A **tag push** payload carries the
  version (`github.ref_name`) but no usable single-line text: its `head_commit.message` is
  the whole multiline commit message (verified — the run's `head_sha` is the commit, not the
  annotated tag object), and Actions expressions have no `substring()`, so no short SHA or
  first line ever fits a label. That is why the quality gates hang on the tag
  (`check.yml` triggers on `push: tags: ['v[0-9]*']` plus `pull_request`,
  `run-name: ${{ github.ref_name }}` → run title `v0.0.NN`) while the publish run is
  **dispatched**: the `Dispatch publish run` job of a green tag `check` run calls
  `POST /repos/<repo>/actions/workflows/build.yml/dispatches` with the inputs `version`,
  `notes`, `source_run` and `mode=check`, because a `workflow_dispatch` payload is the only
  one that carries free text. `build.yml` titles itself `publish <version> · <notes>`, i.e.
  `publish v0.0.NN · <commit subject>`; a manual run leaves `notes` empty and titles itself
  `publish <version> · manual · <ref>`. `latest` moves only for `mode=check`. Publish job
  names (`Publish <service> image <version>`) and their job summaries (what is new, publisher,
  image names, tags, version, source SHA, source run URL) are the second carrier. All
  publish runs share one serialising concurrency group (`publish-queue`), so a slower
  build of an older commit can never overwrite `latest` afterwards.
- **Consequence of the tag trigger:** a commit pushed **without** its tag (hook bypassed
  with `--no-verify`, or a hand-created commit) starts no quality-gate run and publishes
  nothing. The one-tag-per-commit rule of `## Versioning` is a build precondition: after
  every commit read the `commit <hash> successful - version v0.0.NN` line of the Husky
  hook, and never push a commit that did not print it.
- After the push, wait for the `check` run titled `v0.0.NN` and for its
  `publish v0.0.NN · <commit subject>` follow-up run: that run is started by the
  `Dispatch publish run` job at the end of a green check run and publishes the versioned
  `api` and `web` images to GHCR.
- A WP is complete only when `check` and `publish images` are green (or a job is
  skipped by design). If a job fails, read the failing log, fix it in a new
  commit and push again.
- Report the run titles (the `check` run `v0.0.NN` and the publish run
  `publish v0.0.NN · <commit subject>`), the version tag, commit hash, run URL and the
  final conclusion to
  the user. A green `npm run check` locally is not a
  substitute for the CI result:
  it does not run `scripts/docker-smoke.sh`, and this development container has
  no Docker.

## Database and tests

- Local Postgres 16: `docker compose -f docker-compose.dev.yml up -d db`
  (credentials as in `.env.example`).
- Migrations: `npm run db:migrate -w @stoerdesk/api`; adapt the schema with
  `npm run db:generate -w @stoerdesk/api` (drizzle-kit, output folder `src/db/migrations`).
- Seeds are idempotent and ordered: `npx tsx src/db/seed-rbac.ts`, then
  `npx tsx src/db/seed-base.ts` (bootstrap administrator from `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`). Seed output never contains an e-mail or a password.
- API integration tests run against a real database via `TEST_DATABASE_URL`
  (fallback `DATABASE_URL`). If the database is unreachable these tests are skipped
  and `npm run check` stays green — they do not replace a database setup, but they do
  verify the migration, the constraints and `gen_uuid_v7()`.
- The E2E (`npm run test:e2e`) uses the same connection to create its own throwaway
  database `stoerdesk_e2e_<run>`, migrates and seeds it and drops it again — it never
  writes into a shared database, and it skips when the account may not `CREATE DATABASE`.
  The bundled Playwright Chromium is a glibc build: in a musl container (this Alpine
  development container) point `E2E_CHROMIUM_PATH` at a distribution browser, e.g.
  `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.

## i18n

- Web namespaces: `common`, `errors`, `validation`, `ticket`, `object`, `oncall`,
  `stats`, `settings`.
- `de` is the default and the reference locale, `en` must be complete
  (the app is multilingual; the code base is English).
- No literal strings in JSX (`i18next/no-literal-string`).
- New namespace file → register it in `apps/web/src/i18n/index.ts`, otherwise
  `npm run i18n:check` fails.

## Commits

- **Conventional Commits** are mandatory: `feat(web): ...`, `fix(api): ...`,
  `docs(spec): ...`, `chore(repo): ...` — subjects and bodies in English.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **DCO**: every commit message ends with `Signed-off-by: <name> <email>` (`git commit -s`).
- **One work package = one commit.** The subject names the work package
  (e.g. `feat(web): WP-M1-09 admin ui users and roles`).
- `commitlint` enforces the format and the sign-off (Husky hook `commit-msg`).

## Work package size (small models)

Work packages are written for small coding models (64k–128k context). A WP that
cannot be finished in one model run is split before implementation.

- One WP = one commit = one model run.
- Max. 3–4 changed source files (tests and fixtures excluded), about 300 changed
  lines, max. 6 source files read.
- WP document max. 120 lines; referenced spec excerpt max. 200 lines.
- Context target 12–20k tokens, hard limit 30k for 64k models; 25–40k target and
  60k hard limit for 128k models.
- Every WP declares `depends-on`, `context-budget`, `spec`, `files-read`,
  `files-write`, `interfaces`, `non-goals`, `acceptance` and `handoff`.
- Template: `docs/WP-TEMPLATE.md`. Validate with `npm run wp:check`.
- Do not mix database, service, API and UI layers in one WP unless the vertical
  slice stays inside the file and line limits.

## Open follow-ups (mandatory closure)

Split follow-ups are easy to lose: until now an announced follow-up existed only as a
`Follow-up WP:` line, so WP-M1-09b–WP-M1-09d were overtaken by WP-M1-10, WP-M1-10b
and WP-M1-10c. These rules close that hole.

- **A split creates files, not sentences.** When a WP is split, the child WP documents
  (`work-packages/<phase>/<nr><suffix>-<slug>.md`) are created **in the same commit**
  as the parent rewrite. A `Follow-up WP:` line without a WP file is a defect, not a
  backlog entry.
- **Collect before starting.** Before implementing a WP run
  `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/`
  and report the open items, so nothing announced stays unnoticed.
- **Numeric order, same phase.** The open items of the running phase are implemented
  in numeric order (…b, …c, …d, …e, then the plain numbers) **before** the next phase
  starts. A phase is closed only when every follow-up of that phase is implemented or
  explicitly cancelled with a reason in the parent WP's `## Handoff`.
- **One backlog of record.** The `Open follow-ups` table in `work-packages/README.md`
  is the backlog; the status prose there and the `## Current status` section here are
  history. Update the table in the commit that adds, starts or finishes an item.

## Versioning (one tag per commit)

- The project is versioned as `v0.0.1`, `v0.0.2`, `v0.0.3`, ... — **every commit
  gets the next patch version** as a git tag. The tag is the version of record;
  the `version` fields in the `package.json` files are kept at the current release
  line and do not need to be bumped per commit.
- The Husky hook `.husky/post-commit` does this automatically: it reads the highest
  existing version tag, bumps the patch number and creates an **annotated** tag on
  the new commit. `.husky/post-merge` applies the same logic to merge commits
  (git merge does not trigger post-commit). Rebases and already-tagged HEADs are
  skipped, no double tags. Annotated tags are required so `git push --follow-tags`
  actually publishes them.
- After every successful commit the hook prints
  `commit <short-hash> successful - version v0.0.N (run 'git push --follow-tags' to share it)`.
  **After each commit, report that success line and the version number to the user.**
- Tags are never pushed automatically; use `git push --follow-tags` (or `git push --tags`).
- If the hook did not run (e.g. `--no-verify` or a tool bypassing hooks), the next
  commit's hook catches up by tagging from the latest tag; do not hand-create tags
  unless correcting that.

## Todo list (mandatory)

From three sub-steps onwards keep a todo list via `todowrite`:

- create all steps as `pending` at the start,
- exactly one step `in_progress` at a time,
- `completed` only after real verification (lint/test/build actually ran),
- blocked steps stay `in_progress` and name the blocker,
- before the final answer no `pending`/`in_progress` left without an explicit mention.

## Structure discipline

- Directory structure, module overview and conventions live in `docs/REPO-MAP.md`
  (max. 200 lines) and are updated **after every work package**.
- New modules are added to the module table with purpose and public API.
- Do not create files outside the designated areas; `docs/material/` holds the
  supplied originals, `specs/` holds the expanded slices (mirrored from the
  supplied original or from `PLAN.md` when the original is missing).

## Data protection and security

- No secrets in the repository. `.env` is ignored, `.env.example` is the template.
- **GitHub push credentials**: the fine-grained PAT lives in the git credential
  store — file `~/.git-credentials` (helper `store`, host `github.com`, user
  `icem0`), set up once per environment. Push with `git push --follow-tags`.
  Never write the token itself into the repository, docs, logs or commits.
- No PII in logs, tests or fixtures.
- Emergency notice: the 112 hint must stay visible on the report form and on the
  printed stickers (see README and `specs/06-report-form.md`). StörDesk accepts
  malfunction reports only — it is never an emergency call path. Do not add other
  emergency numbers to product text.
