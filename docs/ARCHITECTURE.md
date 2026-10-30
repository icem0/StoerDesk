# Architecture

> Placeholder from `work-packages/m1/10-ci-workflow.md` (WP-M1-10), translated into
> English by WP-M1-10c. The chapters are filled as the matching work packages are
> implemented, at the latest after M1.

## Overview

StörDesk is a monorepo-based web application:

- **apps/web** — React + Vite PWA (installable, mobile-first, offline-capable).
- **apps/api** — Fastify + Drizzle + PostgreSQL + pg-boss (jobs, timers, escalation).
- **packages/shared** — shared Zod schemas, types, permission constants, i18n
  resources.

## Data flow

1. Public report (`/m/:token`) → `apps/api` (`/api/v1/public/tickets`) — planned.
2. Tickets run through a state machine
   (`apps/api/src/tickets/state-machine.ts`) — planned.
3. Notifications leave through an outbox (`apps/api/src/notifications`) — planned;
   the channel adapters (ntfy, signal-cli, Matrix, SMTP, Telegram) already exist.
4. Time-based tasks (escalation, reminders, cleanup) run as pg-boss jobs
   (`apps/api/src/jobs`) — planned.

Live today: `GET /api/v1/health`, the auth routes (`POST /api/v1/auth/login`,
`POST /api/v1/auth/logout`, `GET /api/v1/me`), the admin users routes
(`GET`/`POST`/`PATCH /api/v1/users`) and the permission guard behind them. The
schema, the RBAC and bootstrap seeds, the session core and the permission catalog in
`packages/shared` are part of the same base.

## Offline and synchronisation model

- The API and PostgreSQL are the source of truth.
- The PWA keeps a local working copy (IndexedDB via Dexie) for offline work —
  planned, only the dependency is in place.
- Deviations are buffered in an outbox and synchronised as soon as a connection
  exists. Sync errors that cannot be resolved automatically are quarantined and
  never block processing.

## Non-functional requirements

See `specs/14-nfr.md` (availability, security, maintainability).
