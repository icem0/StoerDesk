# WP-M14-38b: The transition contracts and the transition service

format: small-model
status: planned
depends-on: WP-M14-38a
phase: 14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.13, PLAN.md §7; ADR-0025
spec-lines: 50

files-read:

- apps/api/src/tickets/status-service.ts (`readTicketStatuses`, the error class pattern)
- apps/api/src/db/schema.ts (`ticketTransitions`, `ticketStatuses`)
- packages/shared/src/schemas/ticket.ts (`DbTicketStatus`, the status codes)
- apps/api/src/tickets/workflow.ts (`TRANSITIONS`, `TicketTransitionError`)
- apps/api/src/db/migrations/0041_ticket_transitions.sql

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/transition-service.ts

interfaces:

- `TicketTransition { id, fromStatus, toStatus, eventKey, condition, active }` (shared contract)
- `readTicketTransitions(database): Promise<TicketTransition[]>` — active and inactive rows
- `resolveTransition(transitions, fromStatus, eventKey): TicketTransition | undefined`
- `ticketTransitionNotFoundCode = 'transition_not_found'`

## Task

1. `packages/shared/src/schemas/ticket.ts`: the row contract of §7.13 — the type
   `TicketTransition` (`fromStatus`, `toStatus`, `eventKey`, `condition` as a nullable
   record, `active`) and the key-format schema of a transition key
   (`^[a-z][a-z0-9_]{0,39}$`, the shape of the event keys of `PLAN.md` §7) plus the
   `transition_not_found` code.
2. `apps/api/src/tickets/transition-service.ts`: `readTicketTransitions(database)` reads
   the rows ordered by `from_status`, `event_key` through `ticketTransitionSchema`, and
   `resolveTransition(transitions, fromStatus, eventKey)` returns the row that performs
   the step or `undefined` when none is active. The function is pure — no database call —
   so `transitionTicket()` (WP-M14-38c) loads the rows once and resolves them there.
3. No create, update or delete function (WP-M14-39).

## Non-goals

- No route, no UI, no test page for the transitions (WP-M14-39, WP-M14-39b).
- No change of `transitionTicket()` (WP-M14-38c).
- No evaluation of `condition` (WP-M14-41).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; `readTicketTransitions` answers the 22 rows of a migrated database;
`resolveTransition` finds `NEW`/`review_started` and refuses a step whose row is inactive.

## Handoff

- Files changed: the shared ticket contracts, the new transition service
- Interfaces added: `TicketTransition`, `readTicketTransitions`, `resolveTransition`
- Verified:
- Follow-up WP: WP-M14-38c (the workflow engine reads the transition table)
- Open question: none
