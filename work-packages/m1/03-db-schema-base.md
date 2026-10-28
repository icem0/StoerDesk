# WP-M1-03: Drizzle-Schema Grundtabellen

depends-on: WP-M1-01
milestone: m1

## Ziel

Migration 0001: users, sessions, groups, user_groups, settings.
UUID v7 als Default.

## Spec-Referenzen

- specs/02-data-model.md §users, §sessions, §settings
- specs/01-rbac.md §3.2 (Tabellen-Verweis; RBAC-Tabellen separat in WP-M1-05)

## Aufgabe

1. `apps/api/src/db/schema.ts` mit Tabellen users (email, password_hash, locale, active), sessions, groups, user_groups, settings (key, value jsonb)
2. Migration generieren mit drizzle-kit
3. `apps/api/src/db/client.ts` (Pool, drizzle-Instanz)
4. Test: In-Memory-Postgres (oder Test-Container) — Migration läuft, Insert/Select auf users

## Nicht im Scope

- RBAC-Tabellen (WP-M1-05)
- Seed (WP-M1-06)

## Akzeptanz

- Migration läuft auf leerer DB
- Ein User kann angelegt und gelesen werden
