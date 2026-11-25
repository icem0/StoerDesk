# WP-M30-02: the task of the user — the table, the write rule and the API

format: ctx-256k
status: done
depends-on: WP-M30-01
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.10, §11.11, §11.18
spec-lines: 120
changed-lines: 466

files-read:

- specs/10-notifications.md §11.10 (the data model), §11.18 (the task of the user)
- apps/api/src/db/schema.ts (`notificationMessages`, the checks of the outbox)
- apps/api/src/db/migrations/0060_notification_account_target_and_verification.sql (the pattern of a migration)
- apps/api/src/notifications/outbox.ts (`enqueuePersonalDeliveries`, `drainOutbox`, `finishMessage`)
- apps/api/src/notifications/messages.ts (the reading of the messages of today)
- apps/api/src/notifications/routes.ts (the routes of the session)
- packages/shared/src/schemas/notification.ts (the contracts of the notifications)

files-write:

- apps/api/src/db/migrations/0064_notification_items.sql, apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/items.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/items-routes.integration.spec.ts, apps/api/src/db/__tests__/schema.integration.spec.ts
- docs/DECISIONS/0052-the-task-and-the-protocol.md (the number of the migration)
- docs/REPO-MAP.md, CHANGELOG.md (the module map and the record)
- work-packages/m30/02-the-task-of-the-user.md, work-packages/m30/05-the-alarm-of-a-failed-delivery.md (this package and the number of its migration)

interfaces:

- `notification_items` — the table of the tasks: `user_id`, `event_type`, `params`, `ticket_no`, `shift_id`, `created_at`, `read_at`
- `notification_messages.notification_item_id` — the task of a delivery attempt (FK, `ON DELETE SET NULL`)
- `writeItems(database, deliveries)` — one task per recipient of a personal delivery
- `readItems(database, scope)` — the tasks of a user with their filters
- `countUnreadItems(database, userId)` — the number of the unhandled tasks
- `markItemRead(database, id, userId)` — the read receipt of one own task
- `GET /api/v1/notifications/items` — the tasks of the signed-in user
- `GET /api/v1/notifications/items/unread-count` — the number of the unhandled tasks
- `PATCH /api/v1/notifications/items/:id/read` — the read receipt of one own task

## Task

1. **The migration** `0064_notification_items.sql`: the table `notification_items`
   with the columns of §11.18 (`user_id` with the cascade to the users,
   `event_type`, `params` jsonb, `ticket_no`, `shift_id`, `created_at`,
   `read_at`) and the indexes over `(user_id, read_at)` and
   `(user_id, created_at)`. The column `notification_messages.notification_item_id`
   (uuid, FK to `notification_items`, `ON DELETE SET NULL`) — the rows of the
   old phase stay readable without a task.
2. **The schema** `apps/api/src/db/schema.ts`: the table `notificationItems` and
   the column on `notificationMessages`. The checks of the `outbox` table stay
   as they are — the instance event of the failed delivery comes with
   WP-M30-05.
3. **The contracts** `packages/shared/src/schemas/notification.ts`: the schema of
   a task (`notificationItemSchema`), the answer of the list
   (`notificationItemListResponseSchema`), the filter of the list
   (`notificationItemFilterSchema`) and the answer of the read receipt
   (`notificationItemReadResponseSchema`).
4. **The service** `apps/api/src/notifications/items.ts`: `writeItems` writes
   **one** task per recipient of a personal delivery — the deliveries of one
   event over several channels of the same user become one task — and the
   functions of the reading: the list with the filters, the count of the
   unhandled tasks and the read receipt of an own task.
5. **The write path** `apps/api/src/notifications/outbox.ts`: `enqueuePersonalDeliveries`
   writes the task of every recipient in the same transaction as the rows of
   the protocol and points every row at its task. The events of the
   escalation, of the assignment and of the readiness need no change: they all
   go through this one function.
6. **The routes** `apps/api/src/notifications/routes.ts`: the three routes of
   §11.11 behind the session — the list, the count and the read receipt. A task
   of another user answers `404 message_not_found`, an unknown filter answers
   `400 invalid_request` with the field path.
7. **The tests**: the integration test of the routes proves that a user with
   three channels receives **one** task, that the count answers the unhandled
   tasks and that the receipt of a foreign task is refused.

## Non-goals

- No UI — the inbox shows the tasks in WP-M30-04.
- No admin page — the protocol is read in WP-M30-03.
- No event of a failed delivery — the alarm is WP-M30-05.
- No backfill: the tasks begin with the phase (ADR-0052 decision 7).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves one task per user and event and the
refusal of a foreign task.

## Handoff

- Files changed: the migration `0064` with the journal, the schema, the
  contracts, the service `items.ts`, the write path of the outbox, the three
  routes, the test of the routes, the case of the schema test, the ADR (the
  number of the migration), the module map and the changelog
- Interfaces added: the table `notification_items`, the column
  `notification_messages.notification_item_id`, the module
  `apps/api/src/notifications/items.ts` with `writeItems`, `readItems`,
  `countUnreadItems`, `markItemRead` and `taskParams`, and the three routes of
  the tasks
- Verified: `npm run check` green (wp:check 823/0, eslint 0 errors,
  vitest 285 files / 2014 tests, Playwright 15/15); the test of the routes
  proves one task for three channels of the same user, three attempts that
  point at it, the params without the target of the user, the count of the
  unhandled tasks and the refusal of the receipt of a foreign task
- Size: 466 changed lines of the source (the profile counts the source files
  without the tests); the tests add 284 lines, the documentation and the
  bookkeeping 129
- Follow-up WP: WP-M30-03 — the protocol of the administration
- Open question: none
