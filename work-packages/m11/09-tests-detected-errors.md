# WP-M11-09: Tests — Integrationstests für API, Close und Statistik

format: small-model
status: planned
depends-on: WP-M11-03, WP-M11-04, WP-M11-05, WP-M11-06, WP-M11-07
phase: 11
milestone: m11
context-budget: 24k tokens
spec: specs/13-detected-errors.md §13.6
spec-lines: 40

files-read:

- apps/api/src/settings/__tests__/deadlines.integration.spec.ts (Test-Muster)
- apps/api/src/tickets/__tests/ (bestehende Ticket-Tests)
- apps/api/src/stats/__tests__/ (bestehende Stats-Tests)

files-write:

- apps/api/src/settings/__tests__/detected-errors.integration.spec.ts (neu)
- apps/api/src/tickets/__tests__/close-detected-error.integration.spec.ts (neu)
- apps/api/src/stats/__tests__/detected-error-frequency.integration.spec.ts (neu)

interfaces:

- Test-Suiten für CRUD auf `/api/v1/detected-errors` (inkl. `409 detected_error_in_use`)
- Close speichert `detected_error_keys` und schreibt `comment`-Event
- `queryFrequency` liefert `byDetectedError`

## Task

1. `apps/api/src/settings/__tests__/detected-errors.integration.spec.ts`:
   CRUD gegen echte PostgreSQL (skippbar wenn keine DB erreichbar): Anlegen,
   Liste, Bearbeiten, Archivieren/Reaktivieren, Löschen (blockiert bei Nutzung
   → `409`), doppelter Key → `409`.
2. `apps/api/src/tickets/__tests__/close-detected-error.integration.spec.ts`:
   Close mit `comment` und `detectedErrorKeys` speichert beides auf dem Ticket;
   Close ohne Body funktioniert weiterhin; `comment`-Event wird geschrieben.
3. `apps/api/src/stats/__tests__/detected-error-frequency.integration.spec.ts`:
   `queryFrequency` liefert `byDetectedError` korrekt gruppiert.

## Non-goals

- E2E für die gesamte Kette (zu groß für ein WP).
- UI-Playwright-Tests (CI-only).

## Acceptance

```bash
npm run vitest run --project api
```

Erwartet: API-Tests grün oder skip mit benanntem Grund (keine DB); Typecheck
grün.

## Handoff

- Dateien geändert: drei neue Test-Dateien
- Interfaces hinzugefügt: keine (nur Tests)
- Verifiziert: Vitest API-Projekt grün/skip, Typecheck grün
- Follow-up WP: WP-M11-10
- Offene Frage: keine
