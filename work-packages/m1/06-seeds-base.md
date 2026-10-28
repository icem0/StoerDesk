# WP-M1-06: Basis-Seeds

depends-on: WP-M1-05
milestone: m1

## Ziel

Admin-User, 3 Beispielobjekte, 3 Beispielanlagen, Standardtexte als Keys.
Passwort aus .env.

## Spec-Referenzen

- specs/02-data-model.md §objects, §systems, §text_templates
- specs/00-conventions.md §0.1 (Seed-Daten)

## Aufgabe

1. Migration 0003: objects, systems, text_templates, text_template_translations
2. `apps/api/src/db/seed-base.ts`: Admin-User (E-Mail + Passwort aus .env, Argon2id), 3 Objekte (Musterstraße 1/2/3), je 1 BMA, text_templates als Keys (9 BMA-Standardtexte aus specs/02)
3. Übersetzungen in `packages/shared/src/i18n/seed-templates.{de,en}.json`
4. Test: nach Seed existieren 1 Admin, 3 Objekte, 3 Anlagen, 9 Templates mit DE+EN-Übersetzung

## Akzeptanz

- Seed idempotent
- Admin kann sich einloggen (nächster WP)
