# Architektur

> Platzhalter gemäß `work-packages/m1/10-ci-workflow.md` (WP-M1-10).
> Ausgefüllt wird dieses Dokument im Rahmen der Umsetzung, spätestens nach M1.

## Überblick

StörDesk ist eine monorepo-basierte Web-Anwendung:

- **apps/web** — React + Vite PWA (installierbar, mobil-first, offline-fähig).
- **apps/api** — Fastify + Drizzle + PostgreSQL + pg-boss (Jobs/Timer/Eskalation).
- **packages/shared** — gemeinsame Zod-Schemas, Typen, Permission-Konstanten, i18n-Ressourcen.

## Datenfluss

1. Öffentliche Meldung (`/m/:token`) → `apps/api` (`/api/v1/public/tickets`).
2. Tickets werden über eine State-Machine geführt (`apps/api/src/tickets/state-machine.ts`).
3. Benachrichtigungen laufen über eine Outbox (`apps/api/src/notifications`).
4. Zeitgesteuerte Aufgaben (Eskalation, Reminder, Cleanup) laufen als pg-boss-Jobs (`apps/api/src/jobs`).

## Warte- und Synchronisationsmodell

- Quelle der Wahrheit ist die API/PostgreSQL.
- Die PWA hält eine lokale Arbeitskopie (IndexedDB/Dexie) für Offline-Betrieb.
- Abweichungen werden in einer Outbox gepuffert und bei vorhandener Verbindung synchronisiert.

## Nicht-funktionale Anforderungen

Siehe `specs/14-nfr.md` (Verfügbarkeit, Sicherheit, Wartbarkeit).
