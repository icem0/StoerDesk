# WP-M14-120b: the delivery layer records every personal message

format: small-model
status: planned
depends-on: WP-M14-120a
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.3, §11.4, §11.8; PLAN.md §12
spec-lines: 20

files-read:

- apps/api/src/notifications/outbox.ts (the enqueue paths and the drain)
- apps/api/src/notifications/receivers.ts (the personal recipients)
- apps/api/src/escalation/actions.ts (the notify action of the escalation)
- apps/api/src/escalation/distribution.ts (the offer and assign actions)

files-write:

- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/receivers.ts
- apps/api/src/escalation/actions.ts
- apps/api/src/escalation/distribution.ts

interfaces:

- `enqueuePersonalDelivery(database, deliveries)` — writes one
  `notification_messages` row and one `outbox` row per personal delivery; the
  outbox row carries the id of its message in `notification_message_id`.
- `ntfyRecipients(database, eventType)` answers `{ userId, topic }` instead of
  the bare topic, so the caller knows the addressee of the message.
- The drain flips the state of the message of a row to `SENT` or `FAILED` when
  the row reaches its terminal state.

## Task

1. `apps/api/src/notifications/receivers.ts`: `ntfyRecipients` answers one entry
   per user with the stored topic (`{ userId, topic }`), deduplicated by topic.
2. `apps/api/src/notifications/outbox.ts`: add the exported helper
   `enqueuePersonalDelivery` that writes the message row (`PENDING`, the title
   and the body of the message) and the outbox row with the reference to it.
   `enqueueOutbox` uses it for the personal ntfy recipients of `ticket.created`,
   `enqueueOncallOutbox` uses it for the readiness messages of the technician.
3. `apps/api/src/notifications/outbox.ts`: the drain flips the state of the
   message of the row to `SENT` or `FAILED` — also when the channel is no
   longer configured.
4. `apps/api/src/escalation/actions.ts`: the notify action writes the personal
   deliveries of the escalation through the helper, so the escalation reaches
   the inbox of the notified users; an instance-chain row (no single addressee)
   stays without a message.
5. `apps/api/src/escalation/distribution.ts`: the offer and the assign action
   write their personal deliveries through the helper, so the assignment reaches
   the inbox of the technicians.
6. Update the unit test of the outbox worker for the new shape of the fake.

## Non-goals

- No route and no user interface — that is WP-M14-120c and WP-M14-120d.
- No change of the message content of §11.5 and no change of the retries.
- `ticket.resolved` stays without a delivery path — a gap of the event types of
  §11.4 that a later WP closes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a personal delivery carries a message row, and the drain
ends the message as `SENT` or `FAILED`.

## Handoff

- Files changed: the outbox, the receivers, the escalation actions and the
  distribution
- Interfaces added: `enqueuePersonalDelivery`, the recipient with the user id
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120c — the API of the inbox
- Open question: none
