# WP-M14-38: Configurable ticket transitions and DB-driven workflow engine

format: small-model
status: planned
depends-on: WP-M14-37
phase: 14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.1, PLAN.md §7
spec-lines: 80

files-read:

- apps/api/src/tickets/workflow.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0031_escalation_config.sql
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/api/src/db/migrations/0035_ticket_transitions.sql
- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/transition-service.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `transitionTicket(ctx): Promise<{ ticket, event }>` — liest Transition aus `ticket_transitions` statt aus hardcodierter Map
- `readTicketTransitions(database): Promise<TicketTransition[]>`
- `TicketTransition { from_status, to_status, event_key, condition_json, active }`

## Task

1. Migration `0035_ticket_transitions.sql`: Tabelle `ticket_transitions` mit `from_status`, `to_status`, `event_key` (text), `condition_json` (jsonb, optional), `active` (boolean), FKs auf `ticket_statuses(key)`, unique über `(from_status, event_key)`.
2. `apps/api/src/tickets/transition-service.ts`: `readTicketTransitions(database)`, `resolveTransition(transitions, fromStatus, event)` — validiert, dass eine Transition existiert und aktiv ist; wirft `TicketTransitionError` bei ungültigem Übergang.
3. `apps/api/src/tickets/workflow.ts`: `transitionTicket()` lädt die Transitionen einmal pro Request (oder cached) aus der DB statt `TRANSITIONS`-Map zu nutzen; Workflow-Spalten (`accepted_at`, `acknowledged_at`, `closed_at`, …) werden weiterhin anhand des `event_key` gesetzt.

## Non-goals

- Keine API für Transitionen (WP-M14-39).
- Keine UI für Transitionen (WP-M14-39).
- Keine Eskalations-Aktion „Statuswechsel" (WP-M14-40).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run db:migrate
```

Expected: alle grün; Migration erstellt `ticket_transitions`; `transitionTicket()` nutzt DB-Transitionen; ein Ticket in `NEW` mit Event `review_started` wechselt zu `IN_REVIEW` nur wenn eine aktive Transition in der DB existiert; unbekannte Events antworten `409 invalid_transition`.

## Handoff

- Files changed: `0035_ticket_transitions.sql`, `workflow.ts`, `transition-service.ts`, `ticket.ts`
- Interfaces added: `transitionTicket` (DB-driven), `readTicketTransitions`, `resolveTransition`
- Verified: `npm run check` grün
- Follow-up WP: WP-M14-39 (Transition-API + UI), WP-M14-40 (status_change als Eskalations-Aktion)
- Open question (if any): Caching-Strategie für Transitionen pro Request vs. globale Cache-Invalidierung bei Änderung.
