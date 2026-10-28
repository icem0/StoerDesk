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
│   │   └── db/                 Drizzle-Schema, Migrationen
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

| Modul                                    | Zweck                                                                                 | Öffentliche API                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/api/src/auth/requirePermission.ts` | Fastify preHandler, prüft Permission mit ODER-Verknüpfung                             | `requirePermission(...keys: string[]): preHandler`         |
| `apps/api/src/tickets/state-machine.ts`  | `transitionTicket(ticketId, event, actor, payload)` — prüft Übergänge, schreibt Event | `transitionTicket(...): Promise<Ticket>`                   |
| `packages/shared/permissions.ts`         | Permission-Konstanten                                                                 | `PERMISSIONS.ticket.assign`, `PERMISSIONS.object.write`, … |
| `packages/shared/i18n/`                  | Server-Übersetzungen, Seed-Daten                                                      | `t(locale, key, params): string`                           |
| `apps/web/src/lib/usePermission.ts`      | Hook für UI-Ausblendung                                                               | `usePermission(key: string): boolean`                      |
| …                                        |                                                                                       |                                                            |

## Konventionen (Kurzfassung, Details in specs/00)

- Sprache: Code/Kommentare EN, UI über i18n-Keys (DE Default, EN Referenz).
- Fehler: `{ code, params }`, nie übersetzter Text.
- Logging: Pino, strukturiert, keine PII im Klartext.
- Tests: Vitest für Unit, Playwright für E2E.
- Commits: Conventional Commits, `-s` (DCO).

## Stand der Umsetzung

> Es wird **nichts implementiert**. `apps/`, `packages/` und `scripts/` enthalten
> derzeit nur das leere Gerüst (Konfiguration, Einstiegspunkte, leere Locales).
> Die fachliche Umsetzung erfolgt WP für WP nach `work-packages/`.
