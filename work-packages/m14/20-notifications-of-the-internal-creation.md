# WP-M14-20: The internal ticket creation notifies as well

format: small-model
status: planned
depends-on: WP-M14-07
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.4, §11.7; PLAN.md §7, §12
spec-lines: 30

files-read:

- specs/10-notifications.md §11.4, §11.7
- apps/api/src/tickets/report.ts (the enqueue of the public path)
- apps/api/src/tickets/internal.ts (the internal creation)
- apps/api/src/notifications/outbox.ts (the enqueue)

files-write:

- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/report.ts
- apps/api/src/notifications/outbox.ts

interfaces:

- `enqueueOutbox(database, ticket, env, eventType?)` — the event type of the row

## Task

1. The internal creation writes the outbox rows in the transaction of the
   ticket, exactly like the public report path: a report of the office reaches
   the channels as well.
2. The event type of the row is `ticket.created` for both paths; the rows of an
   escalation keep `ticket.escalated` (the escalation action of
   `apps/api/src/escalation/actions.ts`).
3. The selection of the user of §11.4 decides the channels of the rows of
   `ticket.created`; the channel of the instance is used when the user has no
   selection.
4. An integration test proves that an internal ticket creates the row of the
   outbox in the same transaction and that a rollback removes it again.

## Non-goals

- No change of the state machine of the workflow.
- No change of the public path — it stays as it is.
- No account of the recipient — the channels of the instance are used until the
  selection of a user exists.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the internal creation queues the notification in the same
transaction and a rollback leaves no row behind.

## Handoff

- Files changed: the internal creation, the report path, the enqueue and the
  tests
- Interfaces added: the event type of the enqueue
- Verified: `npm run check`
- Follow-up WP: WP-M14-21 — the exit criterion of the phase
- Open question: none
