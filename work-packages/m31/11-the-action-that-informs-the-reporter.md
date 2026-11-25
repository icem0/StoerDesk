# WP-M31-11: the action that informs the reporter

format: ctx-256k
status: planned
depends-on: WP-M31-10
phase: 31
milestone: m31
context-budget: 55k tokens
spec: specs/19-customer-portal.md §19.8 (the report of the reporter), §19.6 (the opt-in)
spec-lines: 30
changed-lines: 480

files-read:

- specs/19-customer-portal.md §19.6 (the opt-in of the reporter), §19.8 (the action)
- specs/07-escalation.md §7.5 (the actions of a rule)
- packages/shared/src/schemas/escalation-config.ts (the catalogue of the actions)
- apps/api/src/escalation/actions.ts (the dispatcher of the actions)
- apps/api/src/escalation/**tests**/actions.integration.spec.ts (the pattern of the test)
- apps/api/src/notifications/outbox.ts (the kinds of the messages, the target of the row)
- apps/api/src/notifications/channels/email.ts (the templates of the mailbox)
- apps/api/src/db/schema.ts (the event types of the outbox)

files-write:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/actions.ts
- apps/api/src/escalation/**tests**/reporter-action.integration.spec.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/channels/email.ts
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0063_outbox_reporter_event.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/**tests**/migrations.spec.ts

interfaces:

- `ESCALATION_ACTION_TYPES` — the type `notify_reporter`
- the event type `ticket.reporter` of the outbox
- the kind `customer_ticket` of the mail
- `POST /api/v1/escalation/actions` — the action of the office

## Task

1. **The catalogue** `packages/shared/src/schemas/escalation-config.ts`: the
   action type `notify_reporter` — it carries no configuration, the recipient
   is the address of the reporter.
2. **The dispatcher** `apps/api/src/escalation/actions.ts`: the action writes
   one row of the outbox with the event `ticket.reporter` and the address of
   the reporter as its target. A ticket without the opt-in of the reporter and
   a ticket without an address are skipped — the opt-in wins over the
   configuration (ADR-0056).
3. **The outbox** `apps/api/src/notifications/outbox.ts` names the kind
   `customer_ticket` for a row that carries the flag of the reporter, and the
   mail of the instance learns the template of that kind.
4. **The migration** `0063` extends the event types of the outbox and the
   types of an action; the schema carries the new event type.
5. **The test** proves that the mail is written for a reporter who agreed to
   it and that nothing is written without the agreement or without an address.

## Non-goals

- No administration of the action — that is WP-M31-12.
- No change of the other actions of the escalation.
- No mail to the reporter without the action of the office.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the catalogue of the actions, the dispatcher, the outbox, the
  mail, the schema, the migration and the tests
- Interfaces added: the action `notify_reporter`, the event `ticket.reporter`
  and the kind `customer_ticket`
- Verified: the commands above
- Follow-up WP: WP-M31-12 — the administration of the action and of the
  template of the mail
- Open question: none
