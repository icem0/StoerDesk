# WP-M17-01: the escalation delivers over the way of the recipient

format: small-model
status: done
depends-on: WP-M17-00
phase: 17
milestone: m17
context-budget: 20k tokens
spec: specs/07-escalation.md §7.5; specs/10-notifications.md §11.3, §11.4, §11.7; ADR-0037
spec-lines: 60

files-read:

- apps/api/src/notifications/receivers.ts (the ntfy recipients of an event)
- apps/api/src/escalation/actions.ts (the `notify` branch of the dispatcher)
- apps/api/src/escalation/distribution.ts (the notification of the `offer` and the `assign`)
- apps/api/src/notifications/outbox.ts (`enqueuePersonalDeliveries`, the shape of a row)
- apps/api/src/escalation/__tests__/actions.integration.spec.ts (the pattern of the test)
- packages/shared/src/schemas/notification.ts (the event types and the channel kinds)

files-write:

- apps/api/src/notifications/receivers.ts (the resolver of the recipients)
- apps/api/src/escalation/actions.ts (the `notify` branch with a target)
- apps/api/src/escalation/distribution.ts (the notification of the distribution)

interfaces:

- `escalationRecipients(database, eventType, userIds): Promise<EscalationRecipient[]>`
  — one entry per recipient and per channel the recipient selected, with the own
  ntfy topic
- `EscalationRecipient { userId, channel, topic }`

## Task

1. `apps/api/src/notifications/receivers.ts` gains `escalationRecipients()`: it
   reads the selection of the recipients for the event type
   (`notification_preferences`) and their own ntfy topic
   (`notification_accounts`). A recipient with a selection row gets one entry per
   selected channel; a recipient **without** a selection row keeps the personal
   fallback of ADR-0037 — the own ntfy topic, and nothing without an ntfy
   account. The topics are deduplicated.
2. `apps/api/src/escalation/actions.ts` replaces `ntfyTopicsOfUsers()` in the
   `notify` branch with a target by `escalationRecipients()`: one personal
   delivery per recipient and per channel — the message row and the outbox row
   of `enqueuePersonalDeliveries()`. The ntfy row carries the own topic of the
   recipient, the other channels carry no topic (the address of the installation
   — the named limitation of ADR-0033 decision 4). The `priority` of the action
   stays the ntfy level.
3. `apps/api/src/escalation/distribution.ts` does the same for the notification
   of the `offer` and the `assign`: the selection of the technician decides the
   way of `ticket.escalated` and of `ticket.assigned`.
4. The broadcast without a target stays as it is: one outbox row per channel of
   the installation, written by the dispatcher itself.
5. The integration test `apps/api/src/escalation/__tests__/actions.integration.spec.ts`
   proves the new behaviour: a recipient who selected telegram for
   `ticket.escalated` gets a telegram row and no ntfy row; a recipient without a
   selection row gets a row on their own ntfy topic; a recipient without a
   selection row and without an ntfy account gets nothing.

## Non-goals

- No personal address for the channels other than ntfy — a telegram, matrix,
  webpush or whatsapp row of a recipient reaches the address of the
  installation (ADR-0033 decision 4).
- No change of the readiness events (ADR-0021) and none of the ticket events
  outside the escalation.
- No migration and no new route: the selection and the accounts exist.
- No change of the inbox — the message row of a personal delivery is written by
  `enqueuePersonalDeliveries()`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/notifications/receivers.ts`,
  `apps/api/src/escalation/actions.ts`, `apps/api/src/escalation/distribution.ts`,
  the integration test `apps/api/src/escalation/__tests__/actions.integration.spec.ts`
  and the distribution test
- Interfaces added: `escalationRecipients(database, eventType, userIds)` and the
  type `EscalationRecipient { userId, channel, topic }`; the lookup
  `ntfyTopicsOfUsers()` is gone
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run wp:check`
- Follow-up WP: WP-M17-02, WP-M17-03 (each file exists in the commit of the split)
- Open question: none
