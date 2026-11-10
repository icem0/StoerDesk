# WP-M11-10: Phase-11 Exit-Kriterium und Record

format: small-model
status: planned
depends-on: WP-M11-01, WP-M11-02, WP-M11-03, WP-M11-04, WP-M11-05, WP-M11-06, WP-M11-07, WP-M11-08, WP-M11-09
phase: 11
milestone: m11
context-budget: 20k tokens
spec: specs/13-detected-errors.md §13.7, PLAN.md §16 phase 11
spec-lines: 60

files-read:

- work-packages/m10/18-phase-10-exit-criterion.md (Exit-Muster)
- PLAN.md §16, §17, §18

files-write:

- work-packages/m11/10-phase-11-exit-criterion.md (diese Datei)
- PLAN.md §16 (Phase-11-Tabelle mit `done`)
- work-packages/README.md (Backlog-Tabelle)
- docs/REPO-MAP.md (neue Module)
- CHANGELOG.md (Unreleased/Added)

interfaces:

- Exit-Kriterium: Close mit optionalen Kommentar + festgestellten Fehlern;
  Statistik `byDetectedError` auswertbar; Admin-Katalog CRUD mit Archivierung

## Task

1. Exit-Kriterium definieren: "Ein Ticket kann im Close-Dialog mit optionalen
   Kommentar und einem oder mehreren festgestellten Fehlern geschlossen werden;
   die Fehler sind in der Statistik unter `byDetectedError` auswertbar; der
   Admin-Katalog ist CRUD-bearbeitbar mit Archivierung statt Löschen."
2. Beweis durch die Integrationstests von WP-M11-09 (CRUD, Close-Speicherung,
   Frequency-Aggregation).
3. `PLAN.md` §16: Phase-11-Tabelle mit allen `status: done`.
4. `work-packages/README.md`: Backlog-Tabelle ergänzen.
5. `docs/REPO-MAP.md`: Neue Module (`specs/13-detected-errors.md`,
   `apps/api/src/settings/detected-errors.ts`,
   `packages/shared/src/schemas/detected-error.ts`,
   `apps/web/src/admin/detected-errors-page.tsx`) in die Module-Tabelle.
6. `CHANGELOG.md`: Unter `[Unreleased]` → `Added` den Feature-Eintrag ergänzen.

## Non-goals

- Kein neuer Code.

## Acceptance

```bash
npm run wp:check
npm run check
```

Erwartet: `wp:check` grün; `check` grün; alle Phase-11-WP-Dateien `status: done`.

## Handoff

- Dateien geändert: WP-M11-10-Datei, `PLAN.md` §16, `work-packages/README.md`,
  `docs/REPO-MAP.md`, `CHANGELOG.md`
- Interfaces hinzugefügt: keine
- Verifiziert: `npm run wp:check`, `npm run check`
- Follow-up WP: none; Phase 11 closes with this package
- Offene Frage: keine
