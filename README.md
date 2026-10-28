<div align="center">

<img src="docs/material/logo.png" alt="StörDesk Logo" width="180" />

# StörDesk

**Störungsdesk für Objekte und Anlagen — nur Störungsmeldungen, keine Notrufe.**

[![CI](https://github.com/StoerDesk/StoerDesk/actions/workflows/check.yml/badge.svg)](https://github.com/StoerDesk/StoerDesk/actions/workflows/check.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.12-brightgreen)](https://nodejs.org)
[![Postgres](https://img.shields.io/badge/postgres-16-blue)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![status: v0.1](https://img.shields.io/badge/status-v0.1%20Grundlage-orange)](CHANGELOG.md)

</div>

> [!IMPORTANT]
> **Nur Störungsmeldungen — kein Notruf.** StörDesk nimmt ausschließlich Meldungen über
> Störungen, Defekte und Schäden ohne Gefahr für Menschen an. Bei akuter Gefahr für
> Menschen, Feuer, Austritt von Gefahrstoffen oder medizinischen Notfällen **sofort 112**
> (Feuerwehr/Rettungsdienst) bzw. **110** (Polizei) wählen — der Hinweis ist auf
> Meldeformular und Aufklebern vorgesehen (siehe [`specs/06-report-form.md`](specs/06-report-form.md)).

## Worum geht es

StörDesk ist ein Web-System für Hausmeister, Facility-Management-Teams und
Technikdienste: **technische Störungen** an Objekten und Anlagen werden strukturiert
gemeldet, über eine State-Machine als Ticket bearbeitet, an die richtige Oncall-Schicht
eskaliert und nachvollziehbar protokolliert. Nicht gemeint sind Einsatzmeldungen von
Feuerwehr, Rettungsdienst oder Polizei.

- **Meldeformular** für Meldende (auch ohne Login, offline-fähig als PWA)
- **Tickets** mit unveränderlichem Event-Protokoll (Audit)
- **Objekte und Anlagen** als Bezugspunkt jeder Störung
- **Oncall und Eskalation** über Schichtpläne und pg-boss-Jobs
- **Benachrichtigungen** über eine Outbox (E-Mail, später Web Push)
- **Dashboard und Statistiken** für Auswertung und Störungstrends
- **Offline-Fähigkeit**: Dexie im Browser, Sync mit Quarantäne bei Konflikten

## Architektur

Monorepo mit npm-Workspaces — Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
und [`docs/REPO-MAP.md`](docs/REPO-MAP.md):

| Paket             | Stack                                                      | Zweck                                      |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `apps/web`        | React + Vite PWA, i18next, TanStack Query, Tailwind, Dexie | Mobile-first, installierbar, offline-fähig |
| `apps/api`        | Fastify, Drizzle, PostgreSQL 16, pg-boss                   | Quelle der Wahrheit: Tickets, RBAC, Outbox |
| `packages/shared` | Zod-Schemas, Typen, Permissions, i18n-Ressourcen           | gemeinsam genutzte Verträge                |

Durchgängige Konventionen: UUID v7 für IDs, Server-Zeit als maßgebliche Zeit,
Fehler als `{ code, params }` (niemals übersetzt im Protokoll), strukturierte
Logs mit Pino, keine Geldbeträge.

## Status

Die Umgebung ist eingerichtet — **Umsetzung** der Spezifikation erfolgt WP für WP
(aktuell: WP-M1-01 bis WP-M1-03, siehe [`CHANGELOG.md`](CHANGELOG.md)).

- Spezifikation: [`specs/`](specs/) (16 Kapitel)
- Arbeitsplanung: [`work-packages/`](work-packages/) (M1, M2)
- Entscheidungen: [`docs/DECISIONS.md`](docs/DECISIONS.md) und `docs/DECISIONS/`

## Schnellstart

Voraussetzungen: Node.js ≥ 22.12, Docker (nur für die lokale Datenbank).

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db
npm run db:migrate -w @stoerdesk/api
npm run dev
```

Danach:

| Dienst | URL                                 |
| ------ | ----------------------------------- |
| Web    | http://localhost:5173               |
| API    | http://localhost:3000               |
| Health | http://localhost:3000/api/v1/health |

Produktionsnah mit allen Diensten:

```bash
docker compose up -d --build
```

## Werkzeuge

| Kommando                    | Wirkung                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `npm run dev`               | startet Web und API im Watch-Modus                              |
| `npm run build`             | baut Web (Vite) und API (esbuild)                               |
| `npm run check`             | Typecheck, ESLint, Vitest, `i18n:check` — nach jeder Änderung   |
| `npm run typecheck`         | TypeScript strict je Workspace                                  |
| `npm run lint` / `lint:fix` | ESLint (flat config)                                            |
| `npm run test` / `test:run` | Vitest in allen Workspaces                                      |
| `npm run i18n:check`        | Key-Parität de/en und referenzierte Keys                        |
| `npm run format`            | Prettier                                                        |
| `npm run db:migrate`        | Migrationen einspielen (`-w @stoerdesk/api`)                    |
| `npm run db:generate`       | neue Drizzle-Migration erzeugen                                 |
| `npm run spec:split`        | zerlegt gelieferte Originale aus `docs/material/` nach `specs/` |

API-Integrationstests laufen gegen eine echte Datenbank über `TEST_DATABASE_URL`
(Fallback `DATABASE_URL`); ohne erreichbare Datenbank werden sie übersprungen.

## Mitwirken

Bevor du Code schreibst: Lies [`CONTRIBUTING.md`](CONTRIBUTING.md) und
[`AGENTS.md`](AGENTS.md). Kurz gefasst:

1. Fachlogik entsteht **nur** als Umsetzung eines Work Packages aus `work-packages/`.
2. Conventional Commits mit DCO Sign-off (`git commit -s`), **ein WP pro Commit**.
3. Nach jeder Änderung: `npm run check`.
4. `docs/REPO-MAP.md` nach jedem WP aktualisieren.
5. UI-Texte ausschließlich über i18n-Keys (`de` Default, `en` vollständig).

Beitragsverhalten: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Datenschutz und Sicherheit

Melde- und Ticktdaten enthalten Personenbezug (Name, Kontakt, Standort).
Grundlagen in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) und
[`SECURITY.md`](SECURITY.md). Keine Secrets im Repository, keine PII in Logs,
Tests oder Fixtures.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
