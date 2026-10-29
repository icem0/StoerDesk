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

### Changed

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

### Deviations

- WP-M1-01: `npm run check` uses per-workspace typechecks instead of a single
  `tsc --noEmit` across all packages (see `AGENTS.md`); ESLint uses a flat config
  (`eslint.config.js`) instead of `.eslintrc.cjs`.
- WP-M1-03: the first migration uses drizzle-kit's number `0000` instead of
  `0001`; exactly one migration exists.

### Not implemented (by design)

- All domain logic (auth, tickets, objects, on-call, notifications, UI).
  Implementation happens only as a work package from `work-packages/` — so far
  WP-M1-01 to WP-M1-04 (foundation and base data model) are implemented.
