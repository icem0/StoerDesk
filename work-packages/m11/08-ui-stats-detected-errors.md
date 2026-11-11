# WP-M11-08: Statistik-UI — `byDetectedError`-Chart

format: small-model
status: planned
depends-on: WP-M11-05
phase: 11
milestone: m11
context-budget: 18k tokens
spec: specs/13-detected-errors.md §13.5
spec-lines: 40

files-read:

- apps/web/src/features/stats/stats-page.tsx (bestehende Charts, Inline-SVG)
- apps/web/src/i18n/locales/{de,en}/stats.json (i18n-Muster)

files-write:

- apps/web/src/features/stats/stats-page.tsx (Änderung: neues Panel)
- apps/web/src/i18n/locales/de/stats.json (Änderung: `stats.detectedErrors.*`)
- apps/web/src/i18n/locales/en/stats.json (Änderung: `stats.detectedErrors.*`)

interfaces:

- Chart-Komponente für `byDetectedError` (Balken, Top 10, Inline-SVG)
- i18n `stats.detectedErrors.*`

## Task

1. `apps/web/src/features/stats/stats-page.tsx`: Auf der Statistik-Seite (`/stats`)
   ein neues Panel "Festgestellte Fehler" mit einem Balken-Chart (Inline-SVG wie
   die bestehenden Charts) über `byDetectedError` der Frequency-Antwort. Top 10,
   sortiert nach Count absteigend; leer wenn keine Daten.
2. i18n-Keys unter `stats.detectedErrors.*` in de und en.

## Non-goals

- Filter-Dimension, Export-Erweiterung (bereits in WP-M11-05).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
```

Erwartet: Typecheck grün; `i18n:check` grün; UI-Test (skippbar).

## Handoff

- Dateien geändert: `stats-page.tsx`, beide `stats.json`
- Interfaces hinzugefügt: `byDetectedError`-Chart
- Verifiziert: Typecheck grün, i18n:check grün
- Follow-up WP: WP-M11-09
- Offene Frage: keine
