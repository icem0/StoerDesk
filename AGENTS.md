# AGENTS

Rules for every coding agent and developer working on **StörDesk**.

## Current status

**Implemented so far: WP-M1-01, WP-M1-02, WP-M1-03.** The repository contains:

- the specification in `specs/` (one placeholder file per chapter),
- the work plan in `work-packages/` (M1, M2),
- the environment (monorepo, configuration, skeleton, CI, Docker),
- the Drizzle base schema with migration `0000_base_tables` (`users`, `sessions`,
  `groups`, `user_groups`, `settings`; UUID v7 via `gen_uuid_v7()`, see ADR-0002),
- the documentation in `docs/`.

Domain logic (auth, tickets, objects, on-call, notifications, UI) is created only as
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
  supplied originals, `specs/` holds the chapters mirrored from them.

## Data protection and security

- No secrets in the repository. `.env` is ignored, `.env.example` is the template.
- No PII in logs, tests or fixtures.
- Emergency notice: the 112/110 hint must stay visible on the report form and on the
  printed stickers (see README and `specs/06-report-form.md`). StörDesk accepts
  malfunction reports only — it is never an emergency call path.
