# WP-M6-05: pause service

format: small-model
status: planned
depends-on: WP-M6-04
phase: 6
milestone: m6
context-budget: 18k tokens
spec: specs/05-timeline.md §5.2
spec-lines: 50

files-read:

- specs/05-timeline.md §5.2
- apps/api/src/db/schema.ts (ticketPauses, tickets, ticketEvents)
- apps/api/src/tickets/workflow.ts (event write pattern)
- apps/api/src/tickets/internal-actions.ts (error pattern)

files-write:

- apps/api/src/tickets/pauses.ts
- apps/api/src/tickets/__tests__/pauses.integration.spec.ts

interfaces:

- `startTicketPause(database, { ticketNo, actorUserId, reason, now? }): Promise<PauseResult>`
- `endTicketPause(database, { ticketNo, actorUserId, now? }): Promise<PauseResult>`
- `closeOpenPause(tx, { ticketId, actorUserId, at }): Promise<void>`
- `PauseError` with `{ statusCode, code, params }`
  (`ticket_not_found`, `pause_already_open`, `pause_not_open`,
  `ticket_not_pausable`)

## Task

1. Implement start/end in one transaction each: lock the ticket row, validate
   the status (`ACKNOWLEDGED`, `CLOSED`, `CANCELLED` are not pausable), write the
   pause row and one `paused` / `resumed` event with `actor_kind = 'user'`.
2. `closeOpenPause` is usable inside another transaction; it sets `ended_at`
   and `ended_by_user_id` and writes no second event (the acknowledgement event
   is the history entry).
3. Return the ticket number, the pause row and the event so a route can answer.
4. Integration test: start/end happy path, double start 409, end without open
   409, acknowledge status refuses a pause.

## Non-goals

- No HTTP route (WP-M6-06).
- No timeline calculation (WP-M6-02 already owns it).
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test proves the partial-index behaviour
through the service.

## Handoff

- Files changed: pause service and its integration test
- Interfaces added: the four functions and `PauseError`
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-06 (routes and acknowledge auto-close)
- Open question: none
