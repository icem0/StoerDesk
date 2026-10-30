# Repository Map

Wird nach jedem Work Package aktualisiert. Max. 200 Zeilen.
Ein Satz pro Modul. Verzeichnisstruktur nur bis Ebene 3.

> Deviation (WP-M1-10, WP-M1-10c): the four `docs/` placeholders (`ARCHITECTURE`,
> `COMPLIANCE`, `GLOSSARY`, `I18N`) are English now. This map and `docs/DECISIONS.md`
> with the ADRs in `docs/DECISIONS/` are still partly German, which breaks the English
> rule of `AGENTS.md`. Normalization is the scope of WP-M1-10d and WP-M1-11.

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
│   │   ├── auth/               Session, Passwort, Login/Logout/`me`, requirePermission
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
.github/workflows/              CI: check (quality, Docker smoke, E2E) and build and push (GHCR)
.github/ISSUE_TEMPLATE/         GitHub issue forms: bug, feature, security (valid YAML, 112-only notice)
scripts/                        Orchestration, split-spec, i18n:check, create-env, wp-check, docker-smoke
Dockerfile                      Multi-stage image build (targets: api, web)
```

## Module (Stand nach jedem WP aktualisieren)

| Modul                                               | Zweck                                                                                                                                                                                 | Öffentliche API                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/db/schema.ts`                         | Drizzle-Schema: Basistabellen + RBAC-Tabellen, UUID v7 als Default (WP-M1-03, WP-M1-05)                                                                                               | `users`, `sessions`, `groups`, `userGroups`, `settings`, `roles`, `permissions`, `rolePermissions`, `userRoles`, `userPermissions`, `uuidDefault` |
| `apps/api/src/db/client.ts`                         | Pool und Drizzle-Instanz (postgres-js) inkl. Schema für Relations                                                                                                                     | `createDatabase(url?): { client, database }`                                                                                                      |
| `apps/api/src/db/migrate.ts`                        | wendet die Migrationen aus `src/db/migrations` an                                                                                                                                     | `runMigrations(): Promise<void>`                                                                                                                  |
| `apps/api/src/db/seed-rbac.ts`                      | idempotenter Seed von Permission-Katalog, fünf Systemrollen und deren Grants (WP-M1-05)                                                                                               | `seedRbac(database): Promise<{ roles, permissions, rolePermissions }>`                                                                            |
| `apps/api/src/db/seed-base.ts`                      | idempotenter Bootstrap-Admin aus `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, verknüpft mit der Rolle `admin` (WP-M1-06)                                                                 | `seedBaseUser(database, credentials): Promise<BaseSeedResult>`, `SeedAdminCredentials`                                                            |
| `apps/api/src/auth/password.ts`                     | Argon2id-Hashing (PHC-Format) und Verify ohne Throw bei kaputtem Hash (WP-M1-06)                                                                                                      | `hashPassword(plain)`, `verifyPassword(storedHash, plain)`, `PASSWORD_HASH_OPTIONS`                                                               |
| `apps/api/src/auth/session.ts`                      | Session-Kern: 256-Bit-Token, SHA-256-`token_hash`, loadSession mit Delete-on-Read abgelaufener Zeilen, Cookie-Optionen (WP-M1-07)                                                     | `SESSION_COOKIE_NAME`, `createSession`, `loadSession`, `destroySession`, `loadUserRoleKeys`, `sessionCookieOptions`, `hashSessionToken`           |
| `packages/shared/src/schemas/auth.ts`               | Zod-Schemas für Login-Payload und `/me`-Antwort (WP-M1-07)                                                                                                                            | `loginRequestSchema`, `meResponseSchema`, `LoginRequest`, `MeResponse`, `AuthUser`                                                                |
| `apps/api/src/auth/sessionPlugin.ts`                | `fastify-plugin`: liest das `session`-Cookie und setzt `request.user`; PreHandler für authentifizierte Routes (WP-M1-07b)                                                             | `sessionPlugin`, `requireUser` (`401 { code: 'session_invalid' }`), `AuthPluginOptions`                                                           |
| `apps/api/src/auth/routes.ts`                       | Login (Argon2id, Decoy-Hash, Rate-Limit `5`/min/IP), Logout und `/me`; Fehler immer als `{ code, params }`; Login und `/me` liefern Rollen- und Permission-Keys (WP-M1-07b, WP-M1-08) | `authRoutes` — `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/me`                                                            |
| `apps/api/src/db/migrations/0000_base_tables.sql`   | Basistabellen und Funktion `gen_uuid_v7()` (ADR-0002)                                                                                                                                 | —                                                                                                                                                 |
| `apps/api/src/db/migrations/0001_rbac_tables.sql`   | RBAC-Tabellen, Check `effect IN ('allow','deny')`, Trigger `protect_system_roles()` (WP-M1-05)                                                                                        | —                                                                                                                                                 |
| `apps/api/src/db/__tests__/helpers/testDatabase.ts` | leere Test-Datenbank (Fallback: angegebene DB), Skip ohne erreichbare DB                                                                                                              | `openTestDatabase(): Promise<TestDatabaseHandle>`                                                                                                 |
| `apps/api/src/auth/requirePermission.ts`            | effective permissions (role union plus allows, minus every denial) cached per request, OR-linked guard, probe route only in `NODE_ENV=test` (WP-M1-08)                                | `loadEffectivePermissions`, `effectivePermissions`, `requirePermission(database, ...keys)`, `permissionProbeRoutes`                               |
| `apps/api/src/admin/users.ts`                       | Admin-User-API: read users/role keys, create users with Argon2id password and role links, update mutable fields, guards for last active admin (WP-M1-09)                              | `adminUsersRoutes` — `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/:id`                                                         |
| `apps/api/src/tickets/state-machine.ts` (geplant)   | `transitionTicket(ticketId, event, actor, payload)` — prüft Übergänge, schreibt Event                                                                                                 | `transitionTicket(...): Promise<Ticket>`                                                                                                          |
| `packages/shared/src/permissions.ts`                | Permission-Katalog (37 Keys) und `DEFAULT_ROLES` — Single Source of Truth (WP-M1-05)                                                                                                  | `PERMISSIONS`, `PERMISSION_KEYS`, `DEFAULT_ROLES`, `SYSTEM_ROLE_KEYS`, `isPermissionKey`                                                          |
| `packages/shared/src/i18n/`                         | server translations and seed resource files (`server.*`, `seed.*`) (WP-M1-04)                                                                                                         | `t(locale, key, params): string`                                                                                                                  |
| `apps/web/src/i18n/index.ts`                        | i18next setup, 8 namespaces, `de` default, bundled locales (WP-M1-04)                                                                                                                 | `i18n`, `namespaces`, `Namespace`                                                                                                                 |
| `scripts/i18n-check.ts`                             | de/en key parity + all `t()` keys in `apps/web/src` must exist (WP-M1-04)                                                                                                             | via `npm run i18n:check`                                                                                                                          |
| `apps/web/src/lib/usePermission.ts` (geplant)       | Hook für UI-Ausblendung                                                                                                                                                               | `usePermission(key: string): boolean`                                                                                                             |
| `apps/api/src/config/env.ts`                        | Zod-Schema der gesamten Umgebung, inkl. Notification-Kanäle (WP-M1-02)                                                                                                                | `loadEnv(source?)`, `loadDotEnvFile()`, `corsOrigins(env)`, `signalRecipients(env)`                                                               |
| `apps/api/src/config/env-file.ts`                   | findet die `.env` der Repository-Wurzel                                                                                                                                               | `findEnvFile(): string \| undefined`                                                                                                              |
| `apps/api/src/notifications/channels/signal.ts`     | sendet über den signal-cli JSON-RPC-Bridge                                                                                                                                            | `sendSignalNotification(config, message, fetch?)`                                                                                                 |
| `apps/api/src/notifications/channels/matrix.ts`     | sendet über die Matrix Client-Server-API                                                                                                                                              | `sendMatrixNotification(config, message, fetch?)`                                                                                                 |
| `apps/api/src/notifications/channels/index.ts`      | aktivierte Kanäle aus der Umgebung ermitteln                                                                                                                                          | `configuredChannels(env): NotificationChannel[]`                                                                                                  |
| `PLAN.md`                                           | Binding scope, stack, phases and WP limits                                                                                                                                            | entry point for every agent                                                                                                                       |
| `docs/WP-TEMPLATE.md`                               | Small-model work-package template                                                                                                                                                     | `npm run wp:check`                                                                                                                                |
| `scripts/wp-check.mjs`                              | Validates small-model WPs (size, context, fields)                                                                                                                                     | via `npm run wp:check`                                                                                                                            |
| `scripts/docker-smoke.sh`                           | wiederholbarer Docker-Smoke-Test: Stack isoliert hochfahren, beide Health-Endpoints pruefen, abbauen (WP-M0-04)                                                                       | `sh scripts/docker-smoke.sh`, CI-Job `docker-smoke`                                                                                               |
| `.github/workflows/build.yml`                       | baut und pusht die versionierten `api`/`web`-Images nach GHCR, sobald `check` auf `main` erfolgreich war (WP-M0-05)                                                                   | `build and push`, `ghcr.io/<owner>/stoerdesk-{api,web}:<version>`                                                                                 |
| `.github/ISSUE_TEMPLATE/{bug,feature,security}.md`  | GitHub issue forms with valid front matter and the 112-only emergency notice (WP-M1-10b)                                                                                              | issue types and labels `bug`, `feature`, `security`                                                                                               |
| `Dockerfile`                                        | Multi-stage image build, targets `api` and `web`                                                                                                                                      | `docker build --target api .`                                                                                                                     |
| `docker-compose.yml`                                | complete stack: db, api, web, optional backup                                                                                                                                         | `docker compose up -d --build`                                                                                                                    |
| `docker-compose.debug.yml`                          | opt-in override: publishes the API host port only                                                                                                                                     | `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d`                                                                          |
| `apps/web/nginx-pwa.conf.template`                  | nginx-Konfiguration (PWA, `/api/`-Proxy auf `${API_UPSTREAM}`)                                                                                                                        | —                                                                                                                                                 |
| `scripts/create-env.mjs`                            | erzeugt `.env` aus `.env.example` mit generierten Secrets                                                                                                                             | via `npm run env:create`                                                                                                                          |
| `docs/DEPLOYMENT.md`                                | deployment: compose stack, volumes, backups, Signal/Matrix                                                                                                                            | —                                                                                                                                                 |

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
> test `scripts/docker-smoke.sh` + guarded CI job `docker-smoke`) and **WP-M0-05**
> (`build and push` workflow: versioned `api`/`web` images in GHCR after `check`).
> **WP-M1-01** (monorepo, tooling), **WP-M1-02** (Docker Compose, `.env.example`),
> **WP-M1-03** (Drizzle base schema `users`, `sessions`, `groups`, `user_groups`, `settings`
> with migration `0000_base_tables` and `gen_uuid_v7()`),
> **WP-M1-04** (i18n skeleton: web i18next setup + locales, shared server `t()`,
> `i18n:check`, active `i18next/no-literal-string` lint rule),
> **WP-M1-05** (RBAC: 37-key permission catalog + `DEFAULT_ROLES` in shared, tables
> `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permissions` with
> migration `0001_rbac_tables`, the `protect_system_roles()` trigger and the
> idempotent seed `src/db/seed-rbac.ts`),
> **WP-M1-06** (base seed: Argon2id hashing in `src/auth/password.ts`, idempotent
> bootstrap administrator from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in
> `src/db/seed-base.ts`, linked to the system role `admin`; seed order migrate →
> `seed-rbac` → `seed-base`),
> **WP-M1-07** (session core in `src/auth/session.ts`: random token, SHA-256 token
> hash in `sessions`, `loadSession` with delete-on-read of expired rows and inactive
> accounts, role keys per request, cookie options; shared `loginRequestSchema` and
> `meResponseSchema`),
> **WP-M1-07b** (auth HTTP layer: `sessionPlugin` decorating `request.user` plus the
> `requireUser` preHandler, login/logout/me routes with the `5`-per-minute login rate
> limit, and the `{ code, params }` envelope for `429 rate_limited` through the error
> handler in `src/index.ts`),
> **WP-M1-08** (effective permissions, `requirePermission` with OR semantics and the
> test-only probe route) and **WP-M1-09** (admin users API: list users with role
> keys, create users with Argon2id hashes and role links, update mutable user fields
> and role links, with guards for duplicate e-mail, unknown role keys and the last
> active admin), **WP-M1-10** (English governance files — `CONTRIBUTING.md`,
> `SECURITY.md`, `CODE_OF_CONDUCT.md` with the Contributor Covenant 2.1 text — plus the
> English CI step name) and **WP-M1-10b** (the GitHub issue forms for bug, feature and
> security are valid GitHub issue forms again, with the 112-only emergency notice) and
> **WP-M1-10c** (`docs/ARCHITECTURE.md`, `docs/COMPLIANCE.md`, `docs/GLOSSARY.md` and
> `docs/I18N.md` are English).
> The compose stack runs the whole system (db, api, web) and the optional
> notification channels (external ntfy, signal, matrix, mail) from one `.env`;
> `npm run env:create` generates it with random secrets. The default build context
> is the local checkout; deployment panels set `IMAGE_BUILD_CONTEXT` to the Git URL.
> `PLAN.md` is the binding build plan, and `work-packages/m0` holds the Phase 0
> startability work packages. The Web app still has no UI beyond the shell; the API
> serves `/api/v1/health`, the auth routes and the admin users routes, and holds the
> schema, the seeds, the session core and the notification channel adapters. Only the
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
