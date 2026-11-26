# WP-M30-05: the alarm of a failed delivery

format: ctx-256k
status: done
depends-on: WP-M30-04
phase: 30
milestone: m30
context-budget: 52k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.11, §11.18; PLAN.md §12
spec-lines: 110
changed-lines: 560

files-read:

- specs/10-notifications.md §11.7 (the delivery), §11.18 (the task of the user)
- apps/api/src/notifications/outbox.ts (`drainOutbox`, `finishRow`, `messageOf`)
- apps/api/src/notifications/receivers.ts (`userChannels` — the confirmed channels of a user)
- apps/api/src/notifications/items.ts (`writeItems` — the task of a personal delivery)
- apps/api/src/auth/requirePermission.ts (`loadEffectivePermissions` — the rights of a user)
- apps/api/src/db/schema.ts (the event types of the outbox and their checks)

files-write:

- apps/api/src/db/migrations/0067_notification_delivery_failed.sql, apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- apps/api/src/notifications/alarm.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/auth/requirePermission.ts
- packages/shared/src/i18n/server.de.json, packages/shared/src/i18n/server.en.json
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/features/notifications/inbox-page.tsx
- apps/api/src/notifications/__tests__/delivery-failure-alarm.integration.spec.ts
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- docs/REPO-MAP.md, CHANGELOG.md
- work-packages/m30/05-the-alarm-of-a-failed-delivery.md

interfaces:

- the event type `notification.delivery_failed` — an instance event of the outbox
- `deliveryFailureDeliveries(database, failure, now?)` — the deliveries of the alarm
- `usersWithPermission(database, key)` — the users with a right (the group of the administration)
- `DELIVERY_FAILURE_THROTTLE_MS` — one task per channel and machine code per hour

## Task

A message that never arrived reaches nobody today: the failing channels are
visible on `/admin/delivery`, and the warning of a broken channel goes out once
per channel and per day (§11.15). The office asked for the other thing: **an
administration that learns that a message did not arrive** — as a task in its own
postfach, not as a badge someone has to look for (§11.18, ADR-0052).

1. **The migration** `0067_notification_delivery_failed.sql`: the event type
   `notification.delivery_failed` joins the instance event types of the check of
   the `outbox` table, and the check `outbox_ticket_or_shift_check` learns the
   shape of the instance row — no ticket and no shift, like the row of the
   warning of a broken channel.
2. **The schema** `apps/api/src/db/schema.ts`: the instance event type joins
   the list and the check of the shape learns the new type.
3. **The group** `usersWithPermission` in
   `apps/api/src/auth/requirePermission.ts`: the users with a right — the union
   of the rights of their roles and the explicit allows, minus the explicit
   denials (§3.2). The group of the alarm is the group with
   `notification.read_all` (§11.16).
4. **The module** `apps/api/src/notifications/alarm.ts`:
   `deliveryFailureDeliveries` answers the deliveries of the alarm — one per
   **confirmed channel of every recipient** of the group (§11.4, ADR-0045). The
   throttle: **one** task per channel and machine code per hour, so a channel
   that is broken for a day does not flood the inbox. A recipient without a
   confirmed channel gets nothing — the rule of the administration warns, it
   never blocks (§11.9) — and the failure stays visible in the protocol.
5. **The hook** `apps/api/src/notifications/outbox.ts`: a row that fails
   **finally** — no fallback of the chain left — writes the alarm. The alarm
   never alarms itself: the warning of a broken channel and the alarm of a
   failed delivery write no new task, and the throttle keeps the rest quiet.
6. **The text** `packages/shared/src/i18n/server.{de,en}.json`: the message of
   the alarm over the channels of the administration names the channel and the
   machine code — never an address of a user (§11.13).
7. **The task** in the interface (`inbox.task.deliveryFailed`,
   `inbox.channels.*`): the readable text of the task names the channel and
   the machine code, and the link leads to the ticket of the message that never
   arrived.
8. **The tests**: the integration test proves that a failed delivery writes a
   task for the user with the right and none for the user without it, that the
   throttle holds within the hour and that the alarm never alarms itself; the
   test of the page proves the text of the task.

## Non-goals

- No new permission — the group is the one of `notification.read_all`.
- No change of the warning of a broken channel (§11.15) and of the problems of
  the channels (§11.8).
- No change of the retry and of the fallback chain of §11.7 — the alarm reads
  their result.
- No state „handled“ and no workflow settings (ADR-0052 decision 6).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the alarm proves the task, the throttle and the
silence of the alarm of itself.

## Handoff

- Files changed: the migration with the journal, the schema, the module of the
  alarm, the drain, the helper of the rights, the texts of the server and of the
  interface, the page of the inbox, the test of the alarm, the test of the page,
  the module map and the changelog
- Interfaces added: the event type `notification.delivery_failed`,
  `deliveryFailureDeliveries`, `usersWithPermission` and
  `DELIVERY_FAILURE_THROTTLE_MS`
- Verified: `npm run check` green (wp:check 838/0, eslint 0 errors, vitest 285 files /
  2024 tests, Playwright 15/15)
- Deviation: the work landed in the commit `cb6baaec` of the parallel session — the
  session squashed its history onto `origin/main` while the packages of the phase were
  committed, and the work of the phase went with it. The record of that is
  **WP-M30-07** (`AGENTS.md`: a commit without its package is a defect, not a backlog
  entry)
- Follow-up WP: WP-M30-06 — the criterion of the phase
- Open question: none
