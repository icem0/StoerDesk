# WP-M11-05: Statistik — `byDetectedError` und View-Erweiterung

format: small-model
status: planned
depends-on: WP-M11-02
phase: 11
milestone: m11
context-budget: 22k tokens
spec: specs/13-detected-errors.md §13.4, specs/12-stats.md §12.3
spec-lines: 80

files-read:

- apps/api/src/db/migrations/0025_stats_views.sql (`stats_tickets`, `stats_ticket_faults`)
- apps/api/src/stats/frequency.ts (`queryFrequency`)
- packages/shared/src/schemas/stats.ts (`frequencyResponseSchema`)
- apps/api/src/stats/routes.ts (Frequency-Route)
- apps/api/src/stats/export.ts (CSV-Export)

files-write:

- apps/api/src/db/migrations/0030_stats_detected_errors.sql (neu: View-Erweiterung + `stats_ticket_detected_errors`)
- apps/api/src/stats/frequency.ts (Änderung: `byDetectedError`)
- packages/shared/src/schemas/stats.ts (Änderung: `frequencyResponseSchema`)
- apps/api/src/stats/routes.ts (keine Änderung nötig, Schema reicht — oder minimale Anpassung)
- apps/api/src/stats/export.ts (CSV-Export inkludiert `byDetectedError`)

interfaces:

- `Frequency.byDetectedError: { key: string; count: number }[]`
- View `stats_ticket_detected_errors`

## Task

1. Migration `0030_stats_detected_errors.sql`: `stats_tickets` um
   `detected_error_keys` ergänzen; neue View `stats_ticket_detected_errors`
   (eine Zeile pro Ticket und `detected_error_keys`-Eintrag via `unnest`,
   analog `stats_ticket_faults`).
2. `apps/api/src/stats/frequency.ts`: `queryFrequency` ergänzt `byDetectedError`
   über `stats_ticket_detected_errors`, sortiert nach Count absteigend, limitiert
   auf 25 Zeilen.
3. `packages/shared/src/schemas/stats.ts`: `frequencyResponseSchema` um
   `byDetectedError` ergänzen.
4. `apps/api/src/stats/export.ts`: CSV-Export trägt `byDetectedError` in die
   Sektion `frequency`.

## Non-goals

- UI-Chart, neue Filter-Dimension, neue Route.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
```

Erwartet: Typecheck grün; `queryFrequency` liefert `byDetectedError`; CSV
enthält die Sektion (WP-M11-09 testet gegen echte DB).

## Handoff

- Dateien geändert: Migration 0030, `frequency.ts`, `stats.ts`, `export.ts`
- Interfaces hinzugefügt: `byDetectedError`, View `stats_ticket_detected_errors`
- Verifiziert: Typecheck grün
- Follow-up WP: WP-M11-06
- Offene Frage: keine
