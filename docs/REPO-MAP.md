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
docs/                           ARCHITECTURE, COMPLIANCE, DECISIONS (ADR), GLOSSARY, I18N, REPO-MAP
scripts/                        Orchestrierung, Split-Spec, i18n:check
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
| `packages/shared/i18n/` | Server-Übersetzungen, Seed-Daten | `t(locale, key, params): string` |
| `apps/web/src/lib/usePermission.ts` (geplant) | Hook für UI-Ausblendung | `usePermission(key: string): boolean` |

## Konventionen (Kurzfassung, Details in specs/00)

- Sprache: Code, Kommentare und Entwickler-Doku durchgängig EN; UI-Texte über i18n-Keys
  (`de` Default, `en` vollständig) — die App ist mehrsprachig, die Codebasis ist englisch.
- Fehler: `{ code, params }`, nie übersetzter Text.
- Logging: Pino, strukturiert, keine PII im Klartext.
- Tests: Vitest für Unit, Playwright für E2E.
- Commits: Conventional Commits, `-s` (DCO).

## Stand der Umsetzung

> Umgesetzt: **WP-M1-01** (Monorepo, Tooling), **WP-M1-02** (Docker Compose, `.env.example`),
> **WP-M1-03** (Drizzle-Basisschema `users`, `sessions`, `groups`, `user_groups`, `settings`
> mit Migration `0000_base_tables` und `gen_uuid_v7()`).
> API und Web enthalten weiterhin keine Fachlogik; Locales sind leer. Jedes weitere
> Work Package folgt einzeln nach Freigabe aus `work-packages/`.
>
> Integrationstests der API laufen gegen eine echte Postgres-16-Datenbank
> (`TEST_DATABASE_URL`, siehe `.env.example`); ohne erreichbare Datenbank werden sie
> übersprungen, `npm run check` bleibt grün.
