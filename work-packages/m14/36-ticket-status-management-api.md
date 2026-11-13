# WP-M14-36: Ticket status management API

format: small-model
status: planned
depends-on: WP-M14-35
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.9, specs/02-data-model.md §4.8
spec-lines: 40

files-read:

- apps/api/src/escalation/routes.ts
- apps/api/src/db/schema.ts
- apps/api/src/auth/requirePermission.ts
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/api/src/tickets/status-service.ts
- apps/api/src/tickets/status-routes.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `GET /api/v1/admin/statuses` — `settings.read`, liste aller Stati
- `POST /api/v1/admin/statuses` — `settings.write`, neuen Status anlegen
- `PATCH /api/v1/admin/statuses/:key` — `settings.write`, Status ändern
- `DELETE /api/v1/admin/statuses/:key` — `settings.write`, Status löschen (nur wenn kein Ticket ihn trägt)

## Task

1. `apps/api/src/tickets/status-service.ts`: `readTicketStatuses(database)`, `createTicketStatus(database, input)`, `updateTicketStatus(database, key, input)`, `deleteTicketStatus(database, key)` — Validierung, dass ein gelöschter Status nicht mehr von Tickets referenziert wird, und dass mindestens ein Status aktiv bleibt.
2. `apps/api/src/tickets/status-routes.ts`: Fastify-Routes unter `/api/v1/admin/statuses` mit `settings.read` / `settings.write` Guards, Zod-Validierung von Request-Body und Antwort.
3. `packages/shared/src/schemas/ticket.ts`: `ticketStatusInputSchema` (key, name_de, name_en, color, position, active, is_terminal) und `ticketStatusResponseSchema` (plus `ticket_count` für Belegung).

## Non-goals

- Keine UI (WP-M14-37).
- Keine Änderung am Workflow-Engine (WP-M14-38).
- Keine Eskalations-Aktion (WP-M14-40).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run test:e2e
```

Expected: alle grün; `GET /api/v1/admin/statuses` liefert die neun Seed-Stati; `POST` legt neuen Status an; `DELETE` eines nicht-genutzten Stati entfernt ihn; `DELETE` eines genutzten Stati antwortet `409 status_in_use`.

## Handoff

- Files changed: `status-service.ts`, `status-routes.ts`, `ticket.ts`
- Interfaces added: 4 Admin-Routes für Stati
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-37 (Status-UI), WP-M14-38 (konfigurierbare Transitionen)
- Open question (if any): ob Status-Schlüssel nachträglich umbenennbar sein sollen (wirkte sich auf FKs aus).
