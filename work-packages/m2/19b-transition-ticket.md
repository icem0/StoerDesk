# WP-M2-19b: transitionTicket() state machine function

format: small-model
status: implemented
depends-on: WP-M2-19a, WP-M2-15
phase: 4
context-budget: 25k tokens
spec: PLAN.md §7 (ticket workflow), PLAN.md §6 (tickets table)
spec-lines: 60

files-read:

- apps/api/src/db/schema.ts — tickets, ticket_events tables
- apps/api/src/auth/requirePermission.ts — requirePermission pattern
- apps/api/src/tickets/internal.ts — route + service pattern

files-write:

- apps/api/src/tickets/workflow.ts — transitionTicket() function + transition map

interfaces:

- `transitionTicket(database, ticketId, event, actorUserId, payload?)` — validates
  role, current status and guards, updates the ticket row and writes one
  append-only `ticket_events` row in the same transaction. Returns the updated
  ticket. Throws `TicketTransitionError` (409 invalid_transition, 403 forbidden,
  404 ticket_not_found).
- Transition map: NEW → IN_REVIEW → WORK_ORDER_CREATED → (OFFERED | ASSIGNED)
  → ACCEPTED → ACKNOWLEDGED → CLOSED; CLOSED → NEW/ASSIGNED (reopen); any →
  CANCELLED (cancel). OFFERED + decline returns to previous distribution step.

## Task

1. `apps/api/src/tickets/workflow.ts`: define the transition map with guard
   functions (which permission keys are required, which columns to update),
   implement `transitionTicket()` in one transaction: load ticket, validate
   transition, update ticket row, insert `ticket_events` row, return updated
   ticket. Throw on invalid transitions with HTTP 409.

## Non-goals

- API routes (WP-M2-19c)
- UI action buttons (WP-M2-19d)
- pg-boss timers / escalation (phase 6)
- ticket_pauses (phase 6)

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. Needs a database for integration tests; without one they skip.

## Handoff

- Files changed: the workflow.ts file above
- Interfaces added: `transitionTicket`, `TicketTransitionError`
- Follow-up WP: WP-M2-19c (workflow API routes)
