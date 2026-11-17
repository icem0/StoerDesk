# WP-M14-120a: the database and the contracts of the notification messages

format: small-model
status: done
depends-on: WP-M14-120
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.8; PLAN.md §12, §6
spec-lines: 20

files-read:

- apps/api/src/db/migrations/0046_escalation_stage_new.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts (the outbox table)
- packages/shared/src/schemas/notification.ts (the channel contracts)

files-write:

- apps/api/src/db/migrations/0047_notification_messages.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- New table `notification_messages` — one row per notification that is enqueued
  for a user: `id` (UUID v7), `user_id` (foreign key to `users`, `ON DELETE
  cascade`), `channel`, `event_type`, `state` (`PENDING`/`SENT`/`FAILED`),
  `title`, `body`, `created_at` and the nullable `read_at`.
- New column `outbox.notification_message_id` — the outbox row of a personal
  delivery points at its message (`ON DELETE set null`); an instance-chain row
  keeps it empty.
- Shared contracts `notificationMessageItemSchema`,
  `notificationMessageListResponseSchema` and `notificationMessageReadResponseSchema`.

## Task

1. Write the migration `0047_notification_messages.sql`: the table with the
   check of the state, the foreign key to `users`, the indexes over
   `(user_id, state)` and `(user_id, created_at)`, the column
   `outbox.notification_message_id` with its foreign key and its index.
2. Register the migration in the journal of the migrations folder — the Drizzle
   migrator reads the journal and applies only the migrations it names, so a
   migration file without a journal entry never reaches a database.
3. Mirror the table and the column in `apps/api/src/db/schema.ts`: the table
   `notificationMessages` before the table `outbox`, the column
   `notificationMessageId` on the outbox row.
4. Add the shared contracts of the message, of the list and of the read receipt
   to `packages/shared/src/schemas/notification.ts`.

## Non-goals

- No write path uses the table yet — that is WP-M14-120b.
- No route and no user interface — that is WP-M14-120c and WP-M14-120d.
- No snapshot file for the migrations: the folder carries the snapshots only up
  to `0014`, the later migrations were written by hand and registered by hand.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a migrated database has the table `notification_messages`
and the column `outbox.notification_message_id`.

## Handoff

- Files changed: the migration, its journal entry, the Drizzle mirror, the
  shared contracts
- Interfaces added: the table `notification_messages`, the column
  `outbox.notification_message_id`, the contracts of the message
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-120b — the delivery layer writes the message rows
- Open question: none
