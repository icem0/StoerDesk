# WP-M30-07: the record of the alarm of the failed delivery (retroactive record)

format: ctx-128k
status: done (retroactive record — the work of the packages **WP-M30-03 … WP-M30-07**
landed on 2026-11-25 in the commit `cb6baaec` of the parallel session, whose subject names
the phases 30, 33, 34, 35, 36, 37 and 38 in one commit: the session squashed its history
onto `origin/main` while the packages of the phase were committed, and the work of the phase
went with it. The record adds no behaviour, it states what the commit carried and which
packages the work belongs to)
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

## Task (what the commit `cb6baaec` carried)

The commit of the parallel session names **the phases 30, 33, 34, 35, 36, 37 and 38** in
one commit: the session squashed its history onto `origin/main` while the packages of
phase 30 were committed, and the work of the phase went with it. The commit carries the
work of **WP-M30-03 … WP-M30-07**:

1. **The protocol of the administration** (WP-M30-03): the route
   `GET /api/v1/admin/notifications/attempts` with the filters of §11.16 and the block
   „the attempts of the delivery“ on the page `/admin/delivery` — the protocol of the
   office beside the problems of the channels, on **one** page.
2. **The inbox as the task list** (WP-M30-04): the page `/notifications` shows one entry
   per task — the readable text, the link into the ticket or into the readiness, the time
   and the read receipt — and names neither a channel nor a delivery state; the three
   routes of the messages leave the API.
3. **The alarm of a failed delivery** (WP-M30-05): the module
   `apps/api/src/notifications/alarm.ts` with the event type
   `notification.delivery_failed`, the throttle of one task per channel and machine code per
   hour and the deliveries of the alarm — one per confirmed channel of every recipient with
   the right `notification.read_all`; the hook in the drain: a row that fails finally — no
   fallback of the chain left — writes the alarm, and the alarm never alarms itself; the
   group `usersWithPermission` in `apps/api/src/auth/requirePermission.ts`; the migration
   `0067_notification_delivery_failed.sql` with the journal, the texts of the server (de,
   en), the text of the task and the names of the channels in the interface (de, en), the
   integration test of the alarm and the case of the page.
4. **The criterion of the phase** (WP-M30-06): the integration test
   `phase30-exit.integration.spec.ts` names every acceptance item of the phase.

The **work packages** of this work are **WP-M30-03 … WP-M30-07**; the commit that carried
it names other work — that is the reason this record exists.

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

- Files changed: this record, the note of the deviation in the packages of the phase
  and the row of the backlog of record
- Interfaces added: none
- Verified: `npm run check` green (the work of the packages of the phase was verified
  in its own commits: wp:check 844/0, eslint 0 errors, vitest 299 files / 2126 tests,
  Playwright 15/15)
- Deviation: the commit `cb6baaec` carried the work of the packages WP-M30-03 …
  WP-M30-07 under the subject of the parallel session — the reason this document was
  written
- Follow-up WP: none
- Open question: none
