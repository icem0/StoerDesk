# WP-M11-02: DB — `detected_errors`-Tabelle und `tickets.detected_error_keys`

format: small-model
status: planned
depends-on: WP-M11-01
phase: 11
milestone: m11
context-budget: 18k tokens
spec: specs/13-detected-errors.md §13.2
spec-lines: 60

files-read:

- apps/api/src/db/schema.ts (`tickets`-Definition, `uuidDefault`, `timestampOptions`)
- apps/api/src/db/migrations/0028_ticket_reporter_metadata.sql (Migration-Format)
- packages/shared/src/schemas/ticket.ts (`ticket`-Schemas)

files-write:

- apps/api/src/db/migrations/0029_detected_errors.sql (neu)
- apps/api/src/db/schema.ts (Änderung: `detected_error_keys` auf `tickets`)

interfaces:

- `detectedErrors` Tabellen-Definition (Drizzle)
- `tickets.detectedErrorKeys: string[]`

## Task

1. Migration `0029_detected_errors.sql` anlegen: Tabelle `detected_errors`
   (`id` UUID v7 PK, `key` unique text not null, `label_de`/`label_en` text not
   null, `archived_at` timestamptz nullable, `created_at`/`updated_at`
   timestamptz not null default now) plus Index auf `key`.
   Spalte `tickets.detected_error_keys text[]` hinzufügen, default
   `'{}'::text[]`, nicht null.
2. Drizzle-Schema `apps/api/src/db/schema.ts` aktualisieren: `detectedErrors`
   Tabelle und `detectedErrorKeys` auf `tickets`.
3. Keine Seed-Daten (leerer Katalog; die Administration befüllt ihn).

## Non-goals

- Keine API, keine UI, keine Default-Werte, keine Statistik.
- Kein Backfill bestehender Tickets.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run db:migrate -w @stoerdesk/api
```

Erwartet: Migration lässt sich auf Test-DB anwenden; Typecheck grün.

## Handoff

- Dateien geändert: Migration 0029, `schema.ts`
- Interfaces hinzugefügt: `detectedErrors`, `tickets.detectedErrorKeys`
- Verifiziert: Migration anwendbar, Typecheck grün
- Follow-up WP: WP-M11-03
- Offene Frage: keine
