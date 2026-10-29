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

**Implemented so far: WP-M0-01, WP-M0-02, WP-M0-03, WP-M0-04 (Phase 0 complete) and
WP-M1-01, WP-M1-02, WP-M1-03, WP-M1-04, WP-M1-05, WP-M1-06, WP-M1-07, WP-M1-07b.**
The repository contains:

- the binding build plan in `PLAN.md` and the expanded slices in `specs/`
  (placeholder chapters stay authoritative from `PLAN.md` until filled),
- the work plan in `work-packages/` (M0, M1, M2 — M0 finished, M1 partially),
- the environment (monorepo, configuration, skeleton, CI, Docker, and the
  repeatable smoke test `scripts/docker-smoke.sh` run by the CI job `docker-smoke`),
- the Drizzle base schema with migration `0000_base_tables` (`users`, `sessions`,
  `groups`, `user_groups`, `settings`; UUID v7 via `gen_uuid_v7()`, see ADR-0002),
- the i18n skeleton (web i18next setup + `locales/{de,en}`, shared server `t()`,
  `scripts/i18n-check.ts`, active `i18next/no-literal-string` lint rule),
- the RBAC layer (permission catalog and `DEFAULT_ROLES` in `packages/shared`,
  migration `0001_rbac_tables`, `seed-rbac.ts`/`seed-base.ts`, Argon2id hashing),
- the auth HTTP layer (`apps/api/src/auth/session.ts`, `sessionPlugin.ts`,
  `routes.ts`: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
  `GET /api/v1/me`; sessions as random tokens with a SHA-256 hash in `sessions`),
- the documentation in `docs/`.

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

Additionally when needed:

```bash
npm run build      # build web + API
npm run format     # Prettier
```

**Deviation from WP-M1-01**: the root `check` script uses the per-workspace typechecks
instead of a single `tsc --noEmit` across all packages, because the API (Node) and
web (DOM) need different `lib` sets. The root `tsconfig.json` remains for editor
and IDE support.

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

## Versioning (one tag per commit)

- The project is versioned as `v0.0.1`, `v0.0.2`, `v0.0.3`, ... — **every commit
  gets the next patch version** as a git tag. The tag is the version of record;
  the `version` fields in the `package.json` files are kept at the current release
  line and do not need to be bumped per commit.
- The Husky hook `.husky/post-commit` does this automatically: it reads the highest
  existing version tag, bumps the patch number and tags the new commit. `.husky/post-merge`
  applies the same logic to merge commits (git merge does not trigger post-commit).
  Rebases and already-tagged HEADs are skipped, no double tags.
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
