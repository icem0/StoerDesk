<div align="center">

<img src="docs/material/logo.png" alt="StörDesk Logo" width="180" />

# StörDesk

**The malfunction desk for buildings and technical assets — structured reports, a ticketed workflow, on-call escalation. Never an emergency call path.**

[![CI](https://github.com/icem0/StoerDesk/actions/workflows/check.yml/badge.svg)](https://github.com/icem0/StoerDesk/actions/workflows/check.yml)
[![Docker](https://img.shields.io/badge/install-docker%20compose-blue)](docs/DEPLOYMENT.md)
[![Postgres](https://img.shields.io/badge/postgres-16-blue)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![status: v0.1](https://img.shields.io/badge/status-v0.1%20foundation-orange)](CHANGELOG.md)

</div>

> [!IMPORTANT]
> **Malfunction reports only — not an emergency call path.** StörDesk accepts reports
> about faults, defects and damage with no danger to people. In case of acute danger to
> humans, fire, escaping hazardous substances or medical emergencies **call 112**
> (fire brigade / ambulance) immediately — that hint is part of the report form and of
> the printed stickers (see [`specs/06-report-form.md`](specs/06-report-form.md)).

## What it is about

StörDesk is a web system for caretakers, facility management teams and technical
services. **Technical malfunctions** in buildings and assets are reported in a
structured way, handled as tickets through a state machine, escalated to the right
on-call shift and recorded in a traceable audit trail. Emergency service dispatch
(fire brigade, ambulance, police) is out of scope by design.

## Features

### Reporting — public QR form, no login

- The QR code of an object opens the report form at `/m/<token>`. The token is the
  only credential, so anyone on site can report a fault without an account.
- Fault types from the live catalogue as chips, free text, optional contact details
  and up to **six photos** (compressed in the browser, verified on the server).
- **Offline capable**: a report made without a connection is stored in the browser
  (IndexedDB) and sent later — exactly once, thanks to the idempotent client id.
- Spam protection: a hidden honeypot, a throttle per IP and per QR token and an
  optional Altcha proof of work that is only demanded for suspicious reports.
- Duplicate hint: open tickets of the same object are shown, so the reporter can
  comment on an existing ticket instead of opening a second one.
- Confirmation with the ticket number and a link to the public status page
  `/s/<token>`; the status page shows the state and the public timeline only.
- The 112 emergency notice sits directly above the send button.

### Tickets and workflow

- Nine states — new, in review, work order created, offered, assigned, accepted,
  acknowledged, closed, cancelled — plus reopen and uncancel. Every transition is
  validated server side and written to the history; an invalid one is refused.
- Twelve workflow actions: review, work order, assign, offer, claim, accept,
  decline, acknowledge, close, reopen, cancel, uncancel.
- Four priorities (low, normal, high, critical) with a deadline per priority —
  168 h / 72 h / 24 h / 8 h by default, configurable in the administration — and a
  timeline bar from green to red in the ticket list and in the ticket view.
- Pauses with a reason: the paused time does not count towards the deadline.
- Escalation: rules on the reaction time and on the deadline (80 % and 100 %) write
  escalation events into the history; an on-call offer that is not accepted in time
  falls back to the group.
- Audit trail: an append-only event log per ticket, protected by a database
  trigger. A permanent deletion is recorded separately with its reason.
- Internal creation of tickets (object, fault types, priority, contact), comments,
  and a branded e-mail preview with a prefilled `mailto:` for the reporter.

### Objects, QR codes and stickers

- Object list with search and filters, object number, name, address, contact, notes.
- A QR token per object, regenerable; a retired token stays resolvable for 30 days.
- Printable sticker sheets (A6 or A4) with the QR code, the object data, the report
  call and the 112 notice — one sheet per object.

### On-call

- Pools, weekly slot grid, shift planning and generation, confirm and decline of a
  shift, including offline.
- Swaps: request, accept, approve, reject, cancel.
- Personal iCal feed of the own shifts.
- Coupling: a new ticket is offered to the on-call shift, the responsible
  technician is resolved and the offer is time-limited.

### Administration

- Users (name, locale, theme, active, roles, password), roles (system roles are
  read-only, custom roles pick from 39 permission keys) and groups.
- Fault type catalogue with German and English texts, deadline and reaction
  settings, branding with company name, logo and the title switch.
- BMAcloud sync: a read-only daily import of assets into the object list, with run
  history, conflicts and a manual trigger. Nothing is ever written back.
- Update control: the header shows the installed version and starts a deployment
  through a webhook after a check on GitHub.

### Dashboard

- The start page carries the primary action "new malfunction" and the counts the
  office needs at a glance: total, open, overdue and not yet reviewed. Every tile
  is a link to the filtered ticket list.

### Notifications — optional

- The API holds an outbox; the worker sends the message, retries it and falls back
  to the next channel. The ticket history shows `notification_sent` and
  `notification_failed`.
- Channels: **e-mail** (SMTP), **ntfy**, **Telegram**, **Signal**, **Matrix** and
  **Web Push**. Each channel stays disabled while its address in `.env` is empty —
  StörDesk ships no notification server of its own.
- Today the outbox is filled by the public QR report; an internally created ticket
  does not notify yet. The browser registration for Web Push is not implemented
  yet — the channel sends to the subscriptions that are already stored.

### Offline, PWA and languages

- Installable PWA with an offline report form, offline acknowledge, comment and
  decline of a ticket. A rejected write stays visible as a conflict and is never
  retried silently.
- German (default) and English, both complete. The code base is English; only
  user-facing text is translated.

### Security

- Sessions in an httpOnly cookie, password hashes with Argon2id, a login rate limit
  per IP, helmet, CORS, a global rate limit and error answers as `{ code, params }`.
- No personal data in the logs, no secrets in the repository, `.env` is ignored.

## Installation

Docker Compose is the supported way to run StörDesk — Docker is the only
prerequisite. Database, migrations, API and web frontend come up as one stack.
**You only adjust the variables in `.env` and deploy the compose file**; the
compose file itself is never edited and Node.js is not needed on the host.

```bash
git clone https://github.com/icem0/StoerDesk.git
cd StoerDesk
cp .env.example .env        # 1. copy the configuration template
$EDITOR .env                # 2. set the secrets (see below)
docker compose up -d --build  # 3. deploy the stack
```

Then open **http://localhost:3080** — the port comes from `WEB_PORT` (3080 by
default, because 8080 collides with many other tools).

### 2. The `.env` file

Two variables are required; the stack refuses to start without them:

```env
POSTGRES_PASSWORD=...    # password of the database user
SESSION_SECRET=...       # signs the session cookies, minimum 32 characters
```

Generate them, for example:

```bash
openssl rand -hex 18   # POSTGRES_PASSWORD
openssl rand -hex 32   # SESSION_SECRET
```

Recommended — the first administrator account. The API creates it on the first
start and never touches it again:

```env
SEED_ADMIN_EMAIL=admin@example.org
SEED_ADMIN_PASSWORD=...      # at least 12 characters
```

> **Change the seed password before the first start.** The template ships
> `SEED_ADMIN_PASSWORD=change-me-admin-password`; a stack that keeps it has a
> publicly known administrator password. Empty the two `SEED_ADMIN_*` variables
> instead and create the account in the administration.

`npm run env:create` writes the same file with generated secrets (a plain Node
script, no `npm install` needed, Node ≥ 22.12) — a convenience, not a
prerequisite.

### 3. The variables that matter

| Variable                                                            | Default                   | Meaning                                                    |
| ------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                 | —                         | **required** — password of the database user               |
| `SESSION_SECRET`                                                    | —                         | **required** — signs the session cookies (≥ 32 characters) |
| `SEED_ADMIN_EMAIL`                                                  | `admin@example.org`       | e-mail of the bootstrap administrator                      |
| `SEED_ADMIN_PASSWORD`                                               | —                         | password of the bootstrap administrator (≥ 12 characters)  |
| `WEB_PORT`                                                          | `3080`                    | published port of the web frontend                         |
| `WEB_BIND_ADDRESS`                                                  | `0.0.0.0`                 | address the web frontend binds to                          |
| `CORS_ORIGIN`                                                       | `http://localhost:5173,…` | allowed browser origins — the public URL of the frontend   |
| `COOKIE_SECURE`                                                     | `false`                   | set to `true` behind an HTTPS reverse proxy                |
| `TZ`                                                                | `Europe/Berlin`           | timezone of the containers                                 |
| `IMAGE_BUILD_CONTEXT`                                               | `.`                       | Git URL for a panel that clones the repository itself      |
| `PGDATA_VOLUME`                                                     | `stoerdesk_pgdata`        | volume of the database                                     |
| `UPLOADS_VOLUME`                                                    | `stoerdesk_uploads`       | volume of the uploaded photos                              |
| `BACKUP_VOLUME`                                                     | `stoerdesk_backups`       | volume of the database dumps                               |
| `BACKUP_INTERVAL_SECONDS`                                           | `86400`                   | seconds between two dumps                                  |
| `BACKUP_RETENTION_DAYS`                                             | `14`                      | days a dump is kept                                        |
| `ALTCHA_SECRET`                                                     | empty                     | enables the proof-of-work captcha                          |
| `SMTP_*`, `NTFY_*`, `TELEGRAM_*`, `SIGNAL_*`, `MATRIX_*`, `VAPID_*` | empty                     | notification channels — a channel stays off while empty    |
| `BMA_API_BASE_URL`, `BMA_API_KEY`                                   | `…/api/v2/`, empty        | BMAcloud sync                                              |
| `GITHUB_REPO`, `GITHUB_BRANCH`                                      | empty, `main`             | the update check                                           |
| `UPDATE_WEBHOOK_URL`, `UPDATE_WEBHOOK_TOKEN`                        | empty                     | the deploy hook the update starts                          |

Every variable the stack understands is documented in
[`.env.example`](.env.example). The version of the application is **not** a
variable: the commit hooks write it into [`VERSION`](VERSION) and tag exactly that
value, so every commit and every image carries the version of the development
workflow.

### 4. What comes up

| Service         | URL                                 | Purpose                             |
| --------------- | ----------------------------------- | ----------------------------------- |
| Web (PWA)       | http://localhost:3080               | the app; nginx also proxies `/api/` |
| API (proxied)   | http://localhost:3080/api/v1/health | health of API and database          |
| Frontend health | http://localhost:3080/healthz       | health of the frontend              |

Only the web frontend publishes a host port. The API and Postgres stay inside the
internal network and are reached by container name, so the stack cannot collide
with other projects on the same Docker host.

Before the API applies pending migrations, the one-shot `db-backup-pre-migrate`
service writes a compressed dump into the `backups` volume. The API container is
not created until that dump exists, so a failed dump stops the deployment instead
of migrating an unprotected database.

### 5. Operating the stack

```bash
docker compose ps                # status of all services
docker compose logs -f api       # API log
docker compose down              # stops the stack, keeps the volumes
docker compose down -v           # stops the stack and DELETES all data
```

Periodic database dumps run as an opt-in profile:

```bash
docker compose --profile backup up -d
```

An update is a pull and a rebuild:

```bash
git pull
docker compose up -d --build --remove-orphans
```

The administration can do the same from the browser: the version badge in the
header checks GitHub and starts the deployment through a webhook. Services,
volumes, backups, HTTPS, panels and troubleshooting:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### 6. HTTPS

The stack serves plain HTTP. Put a reverse proxy (nginx, Caddy, Traefik) in front
of `WEB_PORT` for a public installation and set

```env
COOKIE_SECURE=true
CORS_ORIGIN=https://stoerdesk.example.org
```

### Smoke test

A repeatable smoke test builds the images from the current checkout, starts the
core stack, checks both health endpoints and removes the project with its volumes
again. It uses its own Compose project, its own volumes and its own web port
(`3180`), so a running stack on `3080` is untouched:

```bash
sh scripts/docker-smoke.sh       # needs Docker + Compose plugin; exits 0 when healthy
```

## Architecture

Monorepo with npm workspaces — details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
and [`docs/REPO-MAP.md`](docs/REPO-MAP.md):

| Package           | Stack                                                      | Purpose                                    |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `apps/web`        | React + Vite PWA, i18next, TanStack Query, Tailwind, Dexie | Mobile-first, installable, offline-capable |
| `apps/api`        | Fastify, Drizzle, PostgreSQL 16, pg-boss                   | Source of truth: tickets, RBAC, outbox     |
| `packages/shared` | Zod schemas, types, permissions, i18n resources            | Contracts shared by web and API            |

The Compose stack consists of `db` (PostgreSQL 16), `db-backup-pre-migrate` (a
one-shot dump before every migration), `api` (Fastify, applies pending migrations
at start) and `web` (nginx: PWA + reverse proxy), plus the optional `backup`
service.

Conventions across the code base: UUID v7 for ids, server time as the authoritative
clock, errors as `{ code, params }` (never translated text on the wire), structured
Pino logs, no monetary amounts. **The code base is English** — identifiers, comments
and developer docs; only user-facing text is multilingual via i18n (`de` default,
`en` complete).

## Local development

For development only the database runs in Docker, API and web run on the host
(watch mode, hot reload):

```bash
npm install
npm run env:create
docker compose -f docker-compose.dev.yml up -d db
npm run db:migrate -w @stoerdesk/api
npm run dev
```

| Service | URL                                 |
| ------- | ----------------------------------- |
| Web     | http://localhost:5173               |
| API     | http://localhost:3000               |
| Health  | http://localhost:3000/api/v1/health |

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
| `npm run env:create`        | creates `.env` from `.env.example` with generated secrets        |
| `npm run db:migrate`        | apply migrations (`-w @stoerdesk/api`)                           |
| `npm run db:generate`       | create a new Drizzle migration                                   |
| `npm run spec:split`        | mirrors originals in `docs/material/` into `specs/`              |

API integration tests run against a real database via `TEST_DATABASE_URL`
(fallback `DATABASE_URL`); without a reachable database they are skipped.

## Status

The plan is implemented work package by work package; the phases 0 to 8 are
complete, phase 9 (dashboard and statistics) is in progress. The start page with
the counts is live, the statistics pages are still planned. The history is in
[`CHANGELOG.md`](CHANGELOG.md).

- Build plan: [`PLAN.md`](PLAN.md) (binding scope, stack, phases, WP limits)
- Expanded slices: [`specs/`](specs/) (17 chapters; placeholders fall back to `PLAN.md`)
- Work plan: [`work-packages/`](work-packages/) (M0 … M9)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) and `docs/DECISIONS/`

Domain logic (auth, tickets, objects, on-call, notifications, UI) is created **only**
as the implementation of a work package — package by package, never in bulk.

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
