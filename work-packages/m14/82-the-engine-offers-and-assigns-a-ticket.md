# WP-M14-82: the engine offers and assigns a ticket

format: small-model
status: planned
depends-on: WP-M14-81
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 60

files-read:

- apps/api/src/escalation/actions.ts (the dispatcher of the actions)
- apps/api/src/oncall/coupling.ts (`offerTicket`, `resolveOnCallPerson`, `readOncallSettings`)
- apps/api/src/tickets/workflow.ts (`transitionTicket`, the workflow columns)
- apps/api/src/notifications/receivers.ts (the ntfy topics of the users)
- apps/api/src/notifications/outbox.ts (the outbox rows)

files-write:

- apps/api/src/escalation/distribution.ts
- apps/api/src/escalation/actions.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/notifications/receivers.ts

interfaces:

- `distributeTicket(database, { ticketId, target, kind: 'offer' | 'assign', ... }): Promise<boolean>`
- `resolveTargetTechnicians(database, target): Promise<{ id, name }[]>`
- `transitionTicket()` writes `offered_to_user_id` and `offer_escalated_at` from the payload of an `offered` step
- `ntfyTopicsOfUsers(database, eventType, userIds): Promise<string[]>`

## Task

1. `apps/api/src/escalation/distribution.ts` (new): the resolution of the
   technicians of a target — the members of the `group_id` of a pool, otherwise
   every active user with the `oncall` role, the members of `user_groups` for a
   group; only active users count. The offer performs the `offered` step, names
   the on-call person of the pool in `offered_to_user_id` and sets the offer
   timeout, the assignment performs the `assigned` step and writes one row of
   `ticket_assignees` per technician. Both write one `escalation_note` event
   with `{ rule, stage, target }` and notify the technicians.
2. `apps/api/src/tickets/workflow.ts`: the `offered` step writes
   `offered_to_user_id` and `offer_escalated_at` from the payload, so the
   distribution stays in the transaction of the transition.
3. `apps/api/src/notifications/receivers.ts`: `ntfyTopicsOfUsers()` returns the
   own topic of every user of a list who selected ntfy for the event type — the
   broadcast reaches the technicians and not the office.
4. `apps/api/src/escalation/actions.ts`: the dispatcher gains the two branches;
   a ticket whose status has no such step keeps its status and the action
   writes nothing.
5. The integration spec proves: the offer moves the ticket to `OFFERED` with
   the on-call person of the pool, the assignment moves it to `ASSIGNED` and
   writes the assignees, a ticket without the step changes nothing.

## Non-goals

- No configuration service, no UI (WP-M14-83 … WP-M14-85).
- No change of the manual offer route of the office.
- No per-user routing for the channels other than ntfy.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new integration spec fails before the change and
passes after it.

## Handoff

- Files changed: the new distribution service, the dispatcher, the workflow, the
  receivers
- Interfaces added: `distributeTicket`, `resolveTargetTechnicians`,
  `ntfyTopicsOfUsers`
- Verified:
- Follow-up WP: WP-M14-83 (the configuration service)
- Open question: none
