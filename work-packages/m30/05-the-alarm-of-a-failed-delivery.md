# WP-M30-05: the alarm of a failed delivery

format: ctx-256k
status: planned
depends-on: WP-M30-04
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.11, §11.18
spec-lines: 110
changed-lines: 600

files-read:

- specs/10-notifications.md §11.7 (the delivery), §11.11 (the API), §11.18 (the task)
- apps/api/src/notifications/outbox.ts (`drainOutbox`, `finishRow`, `finishMessage`)
- apps/api/src/notifications/items.ts (the tasks of WP-M30-02)
- apps/api/src/notifications/receivers.ts (`personalRecipients` — the confirmed channels)
- apps/api/src/notifications/health.ts (the warning of a broken channel and their throttle)
- apps/api/src/db/schema.ts (the checks of the outbox and the instance event types)
- apps/api/src/auth/requirePermission.ts (the effective permissions of a user)

files-write:

- apps/api/src/db/migrations/0064_notification_delivery_failed.sql
- apps/api/src/db/schema.ts
- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/alarm.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/items.ts
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- the event type `notification.delivery_failed` — the instance event of a failed delivery
- `enqueueDeliveryFailure(database, env, row)` — the task of the administration for a failed attempt
- `notification.delivery_failed` in `NOTIFICATION_INSTANCE_EVENT_TYPES` — the checks of the outbox know the shape

## Task

1. **The migration** `0064_notification_delivery_failed.sql`: the event type
   `notification.delivery_failed` joins the instance event types of the check
   of the `outbox` table, and the check `outbox_ticket_or_shift_check` learns
   the shape of the instance row — no ticket and no shift, as the row of the
   warning of a broken channel (§11.15).
2. **The schema** `apps/api/src/db/schema.ts`: the instance event type joins
   the list of the check of the `outbox` table; the shape of the instance row
   is known.
3. **The module** `apps/api/src/notifications/alarm.ts`:
   `enqueueDeliveryFailure` writes the task of the administration for a failed
   attempt — the recipients are the users with `notification.read_all`, the way
   is their **own confirmed channel** (§11.4), and the throttle is one task per
   channel and machine code per hour. The failure of the channel that carries
   the alarm writes **no** new task: the alarm never alarms itself.
4. **The hook** `apps/api/src/notifications/outbox.ts`: the drain calls the
   module when a row ends as `FAILED` **and** leaves no fallback open — a
   message that never arrived (§11.7). The row of the alarm belongs to no
   ticket and to no shift; its params name the channel, the machine code and
   the ticket number of the message that never arrived.
5. **The contracts** `packages/shared/src/schemas/notification.ts`: the event
   type joins the shared list and the schema of the task carries the params of
   the failure.
6. **The texts** in `de/common.json` and `en/common.json`: the text of the
   task of a failed delivery names the channel and the machine code — never an
   address of a user and never an emergency number (`PLAN.md` §2).
7. **The tests**: the integration test proves that a failed delivery writes a
   task for a user with `notification.read_all`, that a user without the right
   gets none, that a second failure of the same channel and the same code
   within the hour writes no second task and that the failure of the alarm
   channel writes no task.

## Non-goals

- No change of the retry and of the fallback chain of §11.7 — the alarm reads
  their result.
- No new permission — `notification.read_all` names the group (§11.16).
- No change of the warning of a broken channel (§11.15) — it stays once per
  channel and per day.
- No change of the inbox — the task of the failure appears with the tasks
  (WP-M30-04).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test proves the task of the administration, the
throttle and the silence of the alarm of itself.

## Handoff

- Files changed: the migration, the schema, the contracts, the module of the
  alarm, the drain, the tasks, the two locales
- Interfaces added: the event type `notification.delivery_failed` and
  `enqueueDeliveryFailure`
- Verified: the commands above
- Follow-up WP: WP-M30-06 — the criterion of the phase
- Open question: none
