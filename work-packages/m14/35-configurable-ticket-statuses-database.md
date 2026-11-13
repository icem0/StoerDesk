# WP-M14-35: Configurable ticket statuses in database

format: small-model
status: planned
depends-on: WP-M14-34
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.6, specs/02-data-model.md §4.8
spec-lines: 60

files-read:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/db/migrations/0031_escalation_config.sql
- apps/api/src/db/schema.ts

files-write:

- apps/api/src/db/migrations/0034_ticket_statuses.sql
- packages/shared/src/schemas/ticket.ts
- apps/api/src/db/seed/statuses.ts

interfaces:

- `readTicketStatuses(database): Promise<TicketStatus[]>`
- `TicketStatus { key, name_de, name_en, color, position, active, is_terminal }`

## Task

1. Migration `0034_ticket_statuses.sql`: Tabelle `ticket_statuses` mit Spalten `key` (text, unique, check gegen erlaubte Schlüssel), `names` (jsonb, `de`/`en`), `color` (text), `position` (integer), `active` (boolean), `is_terminal` (boolean), `created_at`, `updated_at`.
2. `packages/shared/src/schemas/ticket.ts`: `TICKET_STATUS_VALUES` wird nicht mehr hardcodiert als `as const`-Enum, sondern als Zod-Schema `ticketStatusSchema` definiert, das gegen die DB-Tabelle validiert wird (laufzeit-seitig geladen). `z.enum(...)` bleibt für API-Antworten, die Werte kommen aus der DB.
3. Seed `apps/api/src/db/seed/statuses.ts`: Idempotenter Seed der neun heutigen Stati (`NEW`, `IN_REVIEW`, `WORK_ORDER_CREATED`, `OFFERED`, `ASSIGNED`, `ACCEPTED`, `ACKNOWLEDGED`, `CLOSED`, `CANCELLED`) mit Standardnamen und Farben.

## Non-goals

- Keine API-Routen für Stati (WP-M14-36).
- Keine Admin-UI für Stati (WP-M14-37).
- Keine Änderung am Workflow-Engine (WP-M14-38).
- Keine Eskalations-Aktion „Statuswechsel" (WP-M14-40).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run db:migrate
```

Expected: alle grün; Migration lässt sich auf eine leere DB anwenden; Seed fügt genau die neun Stati ein; `ticketStatusSchema` akzeptiert alle neun Schlüssel und lehnt Unbekanntes ab.

## Handoff

- Files changed: `0034_ticket_statuses.sql`, `ticket.ts`, `statuses.ts`
- Interfaces added: `readTicketStatuses`, `TicketStatus`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-36 (Status-API), WP-M14-37 (Status-UI)
- Open question (if any): ob `is_terminal` als separates Feld oder über `color`/`name` impliziert wird.
