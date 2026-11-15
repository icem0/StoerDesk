# WP-M14-38c: The workflow engine reads the transition table

format: small-model
status: planned
depends-on: WP-M14-38b
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.13, §7.10, PLAN.md §7; ADR-0025
spec-lines: 60

files-read:

- apps/api/src/tickets/workflow.ts (`TRANSITIONS`, `transitionTicket`, `TicketTransitionError`)
- apps/api/src/tickets/transition-service.ts (`readTicketTransitions`, `resolveTransition`)
- apps/api/src/tickets/status-service.ts (the row-loading pattern)
- apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts (the spec style)
- apps/api/src/db/schema.ts (`ticketTransitions`)
- packages/shared/src/schemas/ticket.ts (`TicketTransition`)

files-write:

- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/__tests__/transition-table.integration.spec.ts

interfaces:

- `transitionTicket(ctx)` resolves the step in `ticket_transitions`
- the workflow columns stay keyed by `event_key`
- an unknown or inactive step answers `409 invalid_transition`

## Task

1. `apps/api/src/tickets/workflow.ts`: `transitionTicket()` loads the rows once per call
   with `readTicketTransitions(database)` and resolves the step with
   `resolveTransition(transitions, fromStatus, event)`; `undefined` throws the existing
   `INVALID_TRANSITION` (409 `invalid_transition`) with `from` and `event` in `params`.
   The UPDATE inside the transaction still re-checks `status = <from>`, and the workflow
   columns (`reviewStartedAt`, `workOrderText`, `acceptedAt`, `acknowledgedAt`, `closedAt`)
   stay keyed by `event_key`; `transition.to` becomes the `toStatus` of the row.
2. `TRANSITIONS` and `TRANSITION_EVENT_KEYS` stay exported: the escalation layer
   (`apps/api/src/escalation/config.ts`) still reads them (WP-M14-40 and WP-M14-41 move
   that view onto the table). The map is no longer the engine.
3. New integration spec `transition-table.integration.spec.ts`: on a migrated database
   a `NEW` ticket moves to `IN_REVIEW` through `review_started`; an event with no row
   answers `409 invalid_transition`; a row the test deactivates (`active = false`) blocks
   its step; a row whose `to_status` was changed moves the ticket to the new status.

## Non-goals

- No transition API route, no UI (WP-M14-39, WP-M14-39b).
- No `status_change` escalation action (WP-M14-40), no condition evaluation (WP-M14-41).
- No change of `apps/api/src/escalation/`, of the pause handling or of the event insert.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec proves the four rules above; the existing workflow,
pause, internal-action and E2E workflow specs stay green on the seeded rows.

## Handoff

- Files changed: the workflow engine, the new integration spec
- Interfaces added: `transitionTicket()` on the table
- Verified:
- Follow-up WP: WP-M14-39 (the transition administration API), then WP-M14-39b (its UI)
- Open question: none — the caching question of the parent is resolved by loading the
  rows once per call
