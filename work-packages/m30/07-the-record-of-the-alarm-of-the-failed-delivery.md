# WP-M30-07: the record of the alarm of the failed delivery (retroactive record)

format: ctx-128k
status: done (retroactive record — the work of **WP-M30-05** landed on 2026-11-25 in
the commit `d15fc267`, whose subject names the repair of the texts of the ticket list: the
commit of the parallel session ran while the files of WP-M30-05 were staged and took them
with it. The record adds no behaviour, it states what the commit carried and which package
the work belongs to)
depends-on: WP-M30-04
phase: 30
milestone: m30
context-budget: 14k tokens
spec: specs/10-notifications.md §11.7, §11.18
spec-lines: 40

files-read:

- apps/api/src/notifications/alarm.ts (the module of the alarm)
- apps/api/src/notifications/outbox.ts (the drain and the hook of the alarm)
- apps/api/src/auth/requirePermission.ts (`usersWithPermission`)
- work-packages/m30/05-the-alarm-of-a-failed-delivery.md (the package of the work)

files-write:

- work-packages/m30/07-the-record-of-the-alarm-of-the-failed-delivery.md — this record
- work-packages/m30/05-the-alarm-of-a-failed-delivery.md — the note of the deviation
- work-packages/README.md — the row of the record in the backlog of record

interfaces:

- none new — the interfaces of the work are named in WP-M30-05

## Task (what commit `d15fc267` actually carried)

1. **The module of the alarm** `apps/api/src/notifications/alarm.ts`: the event type
   `notification.delivery_failed`, the throttle of one task per channel and machine code per
   hour and the deliveries of the alarm — one per confirmed channel of every recipient with
   the right `notification.read_all`.
2. **The hook** `apps/api/src/notifications/outbox.ts`: a row that fails finally — no
   fallback of the chain left — writes the alarm; the alarm never alarms itself.
3. **The group** `usersWithPermission` in
   `apps/api/src/auth/requirePermission.ts`: the users with a right — the roles, the
   explicit allows, minus the explicit denials (§3.2).
4. **The migration** `0067_notification_delivery_failed.sql` with the journal, the event
   type in the checks of the `outbox` table, the texts of the server (de, en), the text of
   the task and the names of the channels in the interface (de, en), the branch of the task
   in the inbox page, the integration test of the alarm and the case of the page.

The **work package** of this work is **WP-M30-05** (`work-packages/m30/05-the-alarm-of-a-failed-delivery.md`);
the commit that carried it names another work — that is the reason this record exists.

## Non-goals

- No behaviour — the work is already in the tree.
- No change of the commits of the parallel session: the history is rewritten by
  nobody, the record states what the commit carried.

## Acceptance

```bash
npm run wp:check
```

Expected: all green; the record changes no behaviour.

## Handoff

- Files changed: this record, the note of the deviation in WP-M30-05 and the row of the
  backlog of record
- Interfaces added: none
- Verified: `npm run check` green (the work of WP-M30-05 was verified in its own commit:
  wp:check 838/0, eslint 0 errors, vitest 285 files / 2024 tests, Playwright 15/15)
- Deviation: the commit `d15fc267` carried the work of WP-M30-05 under the subject of the
  parallel session — the reason this document was written
- Follow-up WP: none
- Open question: none
