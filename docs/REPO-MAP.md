# Repository Map

Wird nach jedem Work Package aktualisiert. Max. 200 Zeilen.
Ein Satz pro Modul. Verzeichnisstruktur nur bis Ebene 3.

## Struktur

```
apps/
├── web/                        React + Vite PWA, i18next, TanStack Query, Tailwind
│   ├── src/
│   │   ├── components/         Wiederverwendbare UI-Komponenten (Button, Dialog, Badge)
│   │   ├── features/           Feature-Ordner (tickets, objects, oncall, stats, settings)
│   │   ├── i18n/               i18next-Setup, locales/{de,en}/{ns}.json
│   │   ├── lib/                API-Client, Hooks (usePermission, useLocale), Utils
│   │   └── routes/             React-Router-Definitionen
│   └── ...
├── api/                        Fastify + Drizzle + pg-boss
│   ├── src/
│   │   ├── auth/               Session, Passwort, requirePermission
│   │   ├── tickets/            Routes, Service, State-Machine, Audit
│   │   ├── objects/            Routes, Service, QR, CSV
│   │   ├── oncall/             Routes, Service, Slot-Berechnung, Tausch
│   │   ├── notifications/      Outbox, Worker, Kanäle
│   │   ├── stats/              Queries, materialisierte Views
│   │   ├── admin/              Users, Roles, Settings, API-Keys
│   │   ├── jobs/               pg-boss-Jobs (Timer, Eskalation, Reminder)
│   │   └── db/                 Drizzle-Schema, Migrationen, Client, Seeds, Integrationstests
│   └── ...
└── ...

packages/
└── shared/                     Zod-Schemas, Typen, i18n-Ressourcen, Permission-Konstanten
    ├── src/
    │   ├── permissions.ts      Permission-Konstanten (Single Source of Truth)
    │   ├── schemas/            Zod-Schemas pro Domäne
    │   └── i18n/               server.{de,en}.json, seed.{de,en}.json
    └── ...

PLAN.md                         Binding build plan (scope, stack, phases, WP limits)
specs/                          Expanded specification slices (PLAN.md wins while a slice is a placeholder)
work-packages/                  Work packages, one Markdown file per WP (m0, m1, m2)
docs/                           ARCHITECTURE, COMPLIANCE, DECISIONS (ADR), GLOSSARY, I18N, REPO-MAP, DEPLOYMENT, WP-TEMPLATE
scripts/                        Orchestration, split-spec, i18n:check, create-env, wp-check, docker-smoke
Dockerfile                      Multi-stage image build (targets: api, web)
```

## Module (Stand nach jedem WP aktualisieren)

| Modul                                               | Zweck                                                                                                           | Öffentliche API                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/db/schema.ts`                         | Drizzle-Schema: Basistabellen + RBAC-Tabellen, UUID v7 als Default (WP-M1-03, WP-M1-05)                         | `users`, `sessions`, `groups`, `userGroups`, `settings`, `roles`, `permissions`, `rolePermissions`, `userRoles`, `userPermissions`, `uuidDefault` |
| `apps/api/src/db/client.ts`                         | Pool und Drizzle-Instanz (postgres-js) inkl. Schema für Relations                                               | `createDatabase(url?): { client, database }`                                                                                                      |
| `apps/api/src/db/migrate.ts`                        | wendet die Migrationen aus `src/db/migrations` an                                                               | `runMigrations(): Promise<void>`                                                                                                                  |
| `apps/api/src/db/seed-rbac.ts`                      | idempotenter Seed von Permission-Katalog, fünf Systemrollen und deren Grants (WP-M1-05)                         | `seedRbac(database): Promise<{ roles, permissions, rolePermissions }>`                                                                            |
| `apps/api/src/db/migrations/0000_base_tables.sql`   | Basistabellen und Funktion `gen_uuid_v7()` (ADR-0002)                                                           | —                                                                                                                                                 |
| `apps/api/src/db/migrations/0001_rbac_tables.sql`   | RBAC-Tabellen, Check `effect IN ('allow','deny')`, Trigger `protect_system_roles()` (WP-M1-05)                  | —                                                                                                                                                 |
| `apps/api/src/db/__tests__/helpers/testDatabase.ts` | leere Test-Datenbank (Fallback: angegebene DB), Skip ohne erreichbare DB                                        | `openTestDatabase(): Promise<TestDatabaseHandle>`                                                                                                 |
| `apps/api/src/auth/requirePermission.ts` (geplant)  | Fastify preHandler, prüft Permission mit ODER-Verknüpfung                                                       | `requirePermission(...keys: string[]): preHandler`                                                                                                |
| `apps/api/src/tickets/state-machine.ts` (geplant)   | `transitionTicket(ticketId, event, actor, payload)` — prüft Übergänge, schreibt Event                           | `transitionTicket(...): Promise<Ticket>`                                                                                                          |
| `packages/shared/src/permissions.ts`                | Permission-Katalog (37 Keys) und `DEFAULT_ROLES` — Single Source of Truth (WP-M1-05)                            | `PERMISSIONS`, `PERMISSION_KEYS`, `DEFAULT_ROLES`, `SYSTEM_ROLE_KEYS`, `isPermissionKey`                                                          |
| `packages/shared/src/i18n/`                         | server translations and seed resource files (`server.*`, `seed.*`) (WP-M1-04)                                   | `t(locale, key, params): string`                                                                                                                  |
| `apps/web/src/i18n/index.ts`                        | i18next setup, 8 namespaces, `de` default, bundled locales (WP-M1-04)                                           | `i18n`, `namespaces`, `Namespace`                                                                                                                 |
| `scripts/i18n-check.ts`                             | de/en key parity + all `t()` keys in `apps/web/src` must exist (WP-M1-04)                                       | via `npm run i18n:check`                                                                                                                          |
| `apps/web/src/lib/usePermission.ts` (geplant)       | Hook für UI-Ausblendung                                                                                         | `usePermission(key: string): boolean`                                                                                                             |
| `apps/api/src/config/env.ts`                        | Zod-Schema der gesamten Umgebung, inkl. Notification-Kanäle (WP-M1-02)                                          | `loadEnv(source?)`, `loadDotEnvFile()`, `corsOrigins(env)`, `signalRecipients(env)`                                                               |
| `apps/api/src/config/env-file.ts`                   | findet die `.env` der Repository-Wurzel                                                                         | `findEnvFile(): string \| undefined`                                                                                                              |
| `apps/api/src/notifications/channels/signal.ts`     | sendet über den signal-cli JSON-RPC-Bridge                                                                      | `sendSignalNotification(config, message, fetch?)`                                                                                                 |
| `apps/api/src/notifications/channels/matrix.ts`     | sendet über die Matrix Client-Server-API                                                                        | `sendMatrixNotification(config, message, fetch?)`                                                                                                 |
| `apps/api/src/notifications/channels/index.ts`      | aktivierte Kanäle aus der Umgebung ermitteln                                                                    | `configuredChannels(env): NotificationChannel[]`                                                                                                  |
| `PLAN.md`                                           | Binding scope, stack, phases and WP limits                                                                      | entry point for every agent                                                                                                                       |
| `docs/WP-TEMPLATE.md`                               | Small-model work-package template                                                                               | `npm run wp:check`                                                                                                                                |
| `scripts/wp-check.mjs`                              | Validates small-model WPs (size, context, fields)                                                               | via `npm run wp:check`                                                                                                                            |
| `scripts/docker-smoke.sh`                           | wiederholbarer Docker-Smoke-Test: Stack isoliert hochfahren, beide Health-Endpoints pruefen, abbauen (WP-M0-04) | `sh scripts/docker-smoke.sh`, CI-Job `docker-smoke`                                                                                               |
| `Dockerfile`                                        | Multi-stage image build, targets `api` and `web`                                                                | `docker build --target api .`                                                                                                                     |
| `docker-compose.yml`                                | complete stack: db, api, web, optional backup                                                                   | `docker compose up -d --build`                                                                                                                    |
| `docker-compose.debug.yml`                          | opt-in override: publishes the API host port only                                                               | `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d`                                                                          |
| `apps/web/nginx-pwa.conf.template`                  | nginx-Konfiguration (PWA, `/api/`-Proxy auf `${API_UPSTREAM}`)                                                  | —                                                                                                                                                 |
| `scripts/create-env.mjs`                            | erzeugt `.env` aus `.env.example` mit generierten Secrets                                                       | via `npm run env:create`                                                                                                                          |
| `docs/DEPLOYMENT.md`                                | deployment: compose stack, volumes, backups, Signal/Matrix                                                      | —                                                                                                                                                 |

## Konventionen (Kurzfassung, Details in specs/00)

- Sprache: Code, Kommentare und Entwickler-Doku durchgängig EN; UI-Texte über i18n-Keys
  (`de` Default, `en` vollständig) — die App ist mehrsprachig, die Codebasis ist englisch.
- Fehler: `{ code, params }`, nie übersetzter Text.
- Logging: Pino, strukturiert, keine PII im Klartext.
- Tests: Vitest für Unit, Playwright für E2E.
- Commits: Conventional Commits, `-s` (DCO).

## Implementation status

> Implemented: **Phase 0 is complete** — **WP-M0-01** (images build from the local
> checkout), **WP-M0-02** (web starts without a healthy API), **WP-M0-03** (binding
> `PLAN.md` + small-model work packages) and **WP-M0-04** (repeatable Docker smoke
> test `scripts/docker-smoke.sh` + guarded CI job `docker-smoke`).
> **WP-M1-01** (monorepo, tooling), **WP-M1-02** (Docker Compose, `.env.example`),
> **WP-M1-03** (Drizzle base schema `users`, `sessions`, `groups`, `user_groups`, `settings`
> with migration `0000_base_tables` and `gen_uuid_v7()`),
> **WP-M1-04** (i18n skeleton: web i18next setup + locales, shared server `t()`,
> `i18n:check`, active `i18next/no-literal-string` lint rule),
> **WP-M1-05** (RBAC: 37-key permission catalog + `DEFAULT_ROLES` in shared, tables
> `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permissions` with
> migration `0001_rbac_tables`, the `protect_system_roles()` trigger and the
> idempotent seed `src/db/seed-rbac.ts`).
> The compose stack runs the whole system (db, api, web) and the optional
> notification channels (external ntfy, signal, matrix, mail) from one `.env`;
> `npm run env:create` generates it with random secrets. The default build context
> is the local checkout; deployment panels set `IMAGE_BUILD_CONTEXT` to the Git URL.
> `PLAN.md` is the binding build plan, and `work-packages/m0` holds the Phase 0
> startability work packages. API and Web still have no request handlers and no UI
> beyond the shell; the API holds the schema, the RBAC seed and the notification
> channel adapters only. Only the
> `common` namespace has real keys, the remaining namespaces are intentionally
> empty. Every further work package follows individually after approval from
> `work-packages/`.
>
> API integration tests run against a real Postgres-16 database
> (`TEST_DATABASE_URL`, see `.env.example`); the CI `check` job provides that
> database as a service, so the integration specs run in CI instead of skipping.
> Without a reachable local database they are skipped and `npm run check` stays
> green — then the CI job is the executed acceptance. The Docker smoke test replaces
> the manual Phase 0 gate: the CI job `docker-smoke` builds the stack and curls both
> health endpoints; on a machine without Docker (such as this dev container) only the
> CI job proves it, locally `sh -n scripts/docker-smoke.sh` and `npm run check` are
> what is available.
