# WP-M1-04: i18n-Grundgerüst

depends-on: WP-M1-01
milestone: m1

## Ziel

i18next im Frontend, t()-Funktion im Backend, i18n:check-Skript, Lint-Regel aktiv.
Leere Locale-Dateien mit Struktur.

## Spec-Referenzen

- specs/00-conventions.md §0.1
- specs/00-conventions.md §2a

## Aufgabe

1. `apps/web/src/i18n/index.ts` (i18next-Setup, Namespaces common, errors, validation, ticket, object, oncall, stats, settings)
2. Leere Dateien `apps/web/src/i18n/locales/{de,en}/{ns}.json` mit `{}` und Header-Kommentar (in JSON nicht möglich → README in `locales/`)
3. `packages/shared/src/i18n/t.ts` (Server-t, liest `server.{de,en}.json`)
4. `packages/shared/src/i18n/server.{de,en}.json` (leer)
5. `packages/shared/src/i18n/seed.{de,en}.json` (leer)
6. `scripts/i18n-check.ts` (Key-Parität de/en, keine ungenutzten Keys, alle im Code referenzierten Keys existieren)
7. ESLint-Regel `i18next/no-literal-string` scharf schalten

## Akzeptanz

- `npm run i18n:check` grün (leer = grün)
- `useTranslation()` funktioniert in einer Test-Komponente
- Lint schlägt bei hartkodiertem String in `apps/web/src/**/*.tsx` fehl
