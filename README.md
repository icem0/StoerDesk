<div align="center">

<img src="docs/material/logo.png" alt="StörDesk Logo" width="180" />

# StörDesk

**Malfunction desk for buildings and technical assets — malfunction reports only, never emergency calls.**

[![CI](https://github.com/icem0/StoerDesk/actions/workflows/check.yml/badge.svg)](https://github.com/icem0/StoerDesk/actions/workflows/check.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.12-brightgreen)](https://nodejs.org)
[![Postgres](https://img.shields.io/badge/postgres-16-blue)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![status: v0.1](https://img.shields.io/badge/status-v0.1%20foundation-orange)](CHANGELOG.md)

</div>

> [!IMPORTANT]
> **Malfunction reports only — not an emergency call path.** StörDesk accepts reports
> about faults, defects and damage with no danger to people. In case of acute danger to
> humans, fire, escaping hazardous substances or medical emergencies **call 112**
> (fire brigade / ambulance) or **110** (police) immediately — that hint is part of the
> report form and of the printed stickers (see [`specs/06-report-form.md`](specs/06-report-form.md)).

## What it is about

StörDesk is a web system for caretakers, facility management teams and technical
services. **Technical malfunctions** in buildings and assets are reported in a
structured way, handled as tickets through a state machine, escalated to the right
on-call shift and recorded in a traceable audit trail. Emergency service dispatch
(fire brigade, ambulance, police) is out of scope by design.

- **Report form** for reporters (works without login, offline-capable as a PWA)
- **Tickets** with an immutable event log (audit trail)
- **Objects and assets** as the reference point of every report
- **On-call and escalation** based on shift schedules and pg-boss jobs
- **Notifications** through an outbox (e-mail, later web push)
- **Dashboard and statistics** for evaluation and malfunction trends
- **Offline support**: Dexie in the browser, sync with quarantine on conflicts

## Architecture

Monorepo with npm workspaces — details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
and [`docs/REPO-MAP.md`](docs/REPO-MAP.md):

| Package           | Stack                                                      | Purpose                                    |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `apps/web`        | React + Vite PWA, i18next, TanStack Query, Tailwind, Dexie | Mobile-first, installable, offline-capable |
| `apps/api`        | Fastify, Drizzle, PostgreSQL 16, pg-boss                   | Source of truth: tickets, RBAC, outbox     |
| `packages/shared` | Zod schemas, types, permissions, i18n resources            | Contracts shared by web and API            |

Conventions across the code base: UUID v7 for ids, server time as the authoritative
clock, errors as `{ code, params }` (never translated text on the wire), structured
Pino logs, no monetary amounts. **The code base is English** — identifiers, comments
and developer docs; only user-facing text is multilingual via i18n (`de` default,
`en` complete).

## Status

The environment is in place — the specification is implemented work package by work
package (currently WP-M1-01 to WP-M1-03, see [`CHANGELOG.md`](CHANGELOG.md)).

- Specification: [`specs/`](specs/) (16 chapters)
- Work plan: [`work-packages/`](work-packages/) (M1, M2)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) and `docs/DECISIONS/`

## Quickstart

Prerequisites: Node.js ≥ 22.12, Docker (for the local database only).

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db
npm run db:migrate -w @stoerdesk/api
npm run dev
```

Then:

| Service | URL                                 |
| ------- | ----------------------------------- |
| Web     | http://localhost:5173               |
| API     | http://localhost:3000               |
| Health  | http://localhost:3000/api/v1/health |

Closer to production, with all services:

```bash
docker compose up -d --build
```

## Tooling

| Command                     | Effect                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run dev`               | starts web and API in watch mode                                 |
| `npm run build`             | builds web (Vite) and API (esbuild)                              |
| `npm run check`             | typecheck, ESLint, Vitest, `i18n:check` — run after every change |
| `npm run typecheck`         | strict TypeScript per workspace                                  |
| `npm run lint` / `lint:fix` | ESLint (flat config)                                             |
| `npm run test` / `test:run` | Vitest in all workspaces                                         |
| `npm run i18n:check`        | de/en key parity and referenced keys                             |
| `npm run format`            | Prettier                                                         |
| `npm run db:migrate`        | apply migrations (`-w @stoerdesk/api`)                           |
| `npm run db:generate`       | create a new Drizzle migration                                   |
| `npm run spec:split`        | mirrors originals in `docs/material/` into `specs/`              |

API integration tests run against a real database via `TEST_DATABASE_URL`
(fallback `DATABASE_URL`); without a reachable database they are skipped.

## Contributing

Before writing code, read [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`AGENTS.md`](AGENTS.md). In short:

1. Domain logic is created **only** as the implementation of a work package from
   `work-packages/`.
2. Conventional Commits with DCO sign-off (`git commit -s`), in English,
   **one work package per commit**.
3. After every change: `npm run check`.
4. Update `docs/REPO-MAP.md` after every work package.
5. UI text exclusively via i18n keys (`de` default, `en` complete); code, comments
   and docs stay English.

Code of conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Data protection and security

Report and ticket data contain personal data (name, contact, location).
Foundations in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) and [`SECURITY.md`](SECURITY.md).
No secrets in the repository, no PII in logs, tests or fixtures.

## License

MIT — see [LICENSE](LICENSE).
