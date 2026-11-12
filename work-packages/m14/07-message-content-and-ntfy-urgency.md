# WP-M14-07: The content of a message and the urgency of ntfy

format: small-model
status: planned
depends-on: WP-M14-03
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.5, §11.7; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.5, §11.7
- apps/api/src/notifications/outbox.ts (the target and `messageOf`)
- apps/api/src/notifications/channels/ntfy.ts (the payload)
- apps/api/src/tickets/report.ts (the enqueue in the transaction)
- apps/api/src/db/schema.ts (the columns of the ticket)

files-write:

- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/channels/ntfy.ts
- apps/api/src/tickets/report.ts

interfaces:

- `messageOf(target)` — the message of a target of the outbox
- the target of a row: `{ ticketNo, priority, objectName, systemType, shortText, workOrderNo }`

## Task

1. The target of an outbox row carries the message parameters of §11.5: the
   ticket number, the priority, the object name and its location, the system
   type, the short text of the report and the AA/SA number if there is one —
   no photo and no contact data.
2. `enqueueOutbox` fills the target from the ticket of the transaction, so the
   public report path and every later path carry the same content.
3. `messageOf` builds the message of a target; the deep link keeps its label of
   the interface language.
4. The ntfy adapter sends the priority of the ticket: `urgent` for a critical
   ticket, the normal priority otherwise — as the header `Priority` and in the
   payload.

## Non-goals

- No change of the retry, the fallback or the events of the worker.
- No photo and no attachment in a message.
- No change of the other adapters — they receive the same text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the unit test of the ntfy adapter asserts `urgent` for a
critical ticket and the content of a message carries no contact data.

## Handoff

- Files changed: the outbox, the ntfy adapter, the report path and the tests
- Interfaces added: the message parameters of the target
- Verified: `npm run check`
- Follow-up WP: WP-M14-08 — the accounts of the users
- Open question: none
