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
│   │   └── db/                 Drizzle-Schema, Migrationen, Client, Integrationstests
│   └── ...
└── ...

packages/
└── shared/                     Zod-Schemas, Typen, i18n-Ressourcen, Permission-Konstanten
    ├── src/
    │   ├── permissions.ts      Permission-Konstanten (Single Source of Truth)
    │   ├── schemas/            Zod-Schemas pro Domäne
    │   └── i18n/               server.{de,en}.json, seed.{de,en}.json
    └── ...

specs/                          Spec Slices (aus PFLICHTENHEFT.md)
work-packages/                  Work Packages, ein Markdown pro WP
docs/                           ARCHITECTURE, COMPLIANCE, DECISIONS (ADR), GLOSSARY, I18N, REPO-MAP, DEPLOYMENT
scripts/                        Orchestrierung, Split-Spec, i18n:check
Dockerfile                      Multi-stage image build (targets: api, web, app)
docker/                         Entrypoints und nginx-Konfiguration der Images
```

## Module (Stand nach jedem WP aktualisieren)

| Modul | Zweck | Öffentliche API |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/db/schema.ts` | Drizzle-Schema der Basistabellen, UUID v7 als Default (WP-M1-03) | `users`, `sessions`, `groups`, `userGroups`, `settings`, `uuidDefault` |
| `apps/api/src/db/client.ts` | Pool und Drizzle-Instanz (postgres-js) inkl. Schema für Relations | `createDatabase(url?): { client, database }` |
| `apps/api/src/db/migrate.ts` | wendet die Migrationen aus `src/db/migrations` an | `runMigrations(): Promise<void>` |
| `apps/api/src/db/migrations/0000_base_tables.sql` | Basistabellen und Funktion `gen_uuid_v7()` (ADR-0002) | — |
| `apps/api/src/db/__tests__/helpers/testDatabase.ts` | leere Test-Datenbank (Fallback: angegebene DB), Skip ohne erreichbare DB | `openTestDatabase(): Promise<TestDatabaseHandle>` |
| `apps/api/src/auth/requirePermission.ts` (geplant) | Fastify preHandler, prüft Permission mit ODER-Verknüpfung | `requirePermission(...keys: string[]): preHandler` |
| `apps/api/src/tickets/state-machine.ts` (geplant) | `transitionTicket(ticketId, event, actor, payload)` — prüft Übergänge, schreibt Event | `transitionTicket(...): Promise<Ticket>` |
| `packages/shared/permissions.ts` | Permission-Konstanten | `PERMISSIONS.ticket.assign`, `PERMISSIONS.object.write`, … |
| `packages/shared/i18n/` | server translations and seed resource files (`server.*`, `seed.*`) (WP-M1-04) | `t(locale, key, params): string` |
| `apps/web/src/i18n/index.ts` | i18next setup, 8 namespaces, `de` default, bundled locales (WP-M1-04) | `i18n`, `namespaces`, `Namespace` |
| `scripts/i18n-check.ts` | de/en key parity + all `t()` keys in `apps/web/src` must exist (WP-M1-04) | via `npm run i18n:check` |
| `apps/web/src/lib/usePermission.ts` (geplant) | Hook für UI-Ausblendung | `usePermission(key: string): boolean` |
| `Dockerfile` | Multi-stage image build, targets `api`, `web` and `app` (default) | `docker build .` → single container with API and PWA on port 80 |
| `docker/api-entrypoint.sh` | applies database migrations before the API starts | `ENTRYPOINT` of the `api` image |
| `docker/app-entrypoint.sh` | migrations, API start, nginx start (combined image) | `ENTRYPOINT` of the `app` image |
| `docker/nginx-app.conf` | nginx config of the combined image (PWA, `/api/` proxy to `127.0.0.1:3000`) | — |
| `docs/DEPLOYMENT.md` | deployment: image matrix, compose stack, panel troubleshooting | — |

## Konventionen (Kurzfassung, Details in specs/00)

- Sprache: Code, Kommentare und Entwickler-Doku durchgängig EN; UI-Texte über i18n-Keys
  (`de` Default, `en` vollständig) — die App ist mehrsprachig, die Codebasis ist englisch.
- Fehler: `{ code, params }`, nie übersetzter Text.
- Logging: Pino, strukturiert, keine PII im Klartext.
- Tests: Vitest für Unit, Playwright für E2E.
- Commits: Conventional Commits, `-s` (DCO).

## Implementation status

> Implemented: **WP-M1-01** (monorepo, tooling), **WP-M1-02** (Docker Compose, `.env.example`),
> **WP-M1-03** (Drizzle base schema `users`, `sessions`, `groups`, `user_groups`, `settings`
> with migration `0000_base_tables` and `gen_uuid_v7()`),
> **WP-M1-04** (i18n skeleton: web i18next setup + locales, shared server `t()`,
> `i18n:check`, active `i18next/no-literal-string` lint rule).
> API and Web contain no domain logic yet; only the `common` namespace has real keys,
> the remaining namespaces are intentionally empty. Every further work package follows
> individually after approval from `work-packages/`.
>
> API integration tests run against a real Postgres-16 database
> (`TEST_DATABASE_URL`, see `.env.example`); without a reachable database they are
> skipped and `npm run check` stays green.
