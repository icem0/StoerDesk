# WP-M14-120: the internal notification inbox (spec and split)

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.3, §11.4, §11.8; PLAN.md §12
spec-lines: 20

depends-on: WP-M14-118, WP-M14-119

files-read:

- apps/api/src/notifications/outbox.ts (the enqueue paths and the drain), apps/api/src/notifications/receivers.ts (the personal recipients)
- apps/api/src/escalation/actions.ts (the notify action), apps/api/src/escalation/distribution.ts (the offer and assign actions)
- apps/api/src/notifications/routes.ts (the notification routes), apps/api/src/dashboard/service.ts (the channel status)
- apps/web/src/components/Shell.tsx (the application shell), apps/web/src/routes/index.tsx (the route table)
- packages/shared/src/schemas/notification.ts (the shared contracts)

files-write:

- work-packages/m14/120-notification-messages-table-and-api.md (this file)
- work-packages/m14/120a-notification-messages-database-and-contracts.md, 120b-notification-message-delivery-layer.md, 120c-notification-messages-api.md
- work-packages/m14/120d-notification-inbox-ui.md, 120e-notification-bell-in-the-shell.md

interfaces:

- The internal layer between the application and the external channels: every
  notification that is enqueued for a **user** is recorded before it leaves to
  ntfy, Telegram, Matrix, Signal, e-mail, WhatsApp Web or Web Push, and the
  record carries the state of that delivery.
- `notification_messages` — one row per personal delivery (`user_id`, `channel`,
  `event_type`, `state` `PENDING`/`SENT`/`FAILED`, `title`, `body`, `created_at`,
  `read_at`).
- `outbox.notification_message_id` — the outbox row of a personal delivery points
  at its message; an instance-chain row (no single addressee) stays without one.
- `GET /api/v1/notifications/messages` — the own messages, newest first.
- `PATCH /api/v1/notifications/messages/:id/read` — the read receipt of one message.
- `/notifications` — the inbox page; the shell carries the bell with the number of
  the unread messages.

## Task

1. This document is the spec of the inbox and announces the split; no product
   code in this commit.
2. **WP-M14-120a** — the database and the contracts: the migration
   `0047_notification_messages.sql` (the table, the indexes, the foreign key of
   the outbox row), its journal entry, the Drizzle mirror and the shared
   contracts of the message and of the read receipt.
3. **WP-M14-120b** — the delivery layer: every enqueue path of a personal
   delivery (`enqueueOutbox`, `enqueueOncallOutbox`, the notify action of the
   escalation, the offer and assign action) writes the message row next to the
   outbox row, and the drain flips the state of the message to `SENT` or `FAILED`.
4. **WP-M14-120c** — the API: `GET /api/v1/notifications/messages`,
   `PATCH /api/v1/notifications/messages/:id/read` and the unread count behind
   the session.
5. **WP-M14-120d** — the user interface: the inbox page `/notifications` with
   the localized texts.
6. **WP-M14-120e** — the bell in the shell with the number of the unread
   messages.

## Non-goals

- No read receipt from the external channel — ntfy, Telegram and the other
  channels cannot report that a message was read; the inbox marks it itself.
- No deletion of messages — the retention of the inbox is a later WP.
- No change of the message content of §11.5 and no new channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the inbox answers the own messages with their state and
the bell shows the number of the unread messages.

## Handoff

- Files changed: the five work-package documents
- Interfaces added: the announcement of the inbox and of its four children
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120a (the database and the contracts) — the first child
- Open question: none
