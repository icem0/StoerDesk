# WP-M14-31: An unconfirmed readiness reminds once

format: small-model
status: planned
depends-on: WP-M14-28
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.1, §4a.4 (ADR-0021), specs/10-notifications.md §11.7
spec-lines: 40

files-read:

- apps/api/src/jobs/escalation.ts (`startTicketEscalation`, the per-minute scan)
- apps/api/src/oncall/coupling.ts (`escalateOnCallOffers`, the same queue)
- apps/api/src/notifications/outbox.ts (`enqueueOncallOutbox` of WP-M14-28)
- apps/api/src/oncall/settings.ts (`readOncallSettings`, `oncall.reminder_unconfirmed_h`)
- apps/api/src/oncall/__tests__/offer-timeout.integration.spec.ts (the scan test pattern)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/jobs/escalation.ts
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts

interfaces:

- `enqueueOncallReminders(database, env, now)` — for every `DRAFT` or `PLANNED` shift that has
  not started and starts within `oncall.reminder_unconfirmed_h`, one `oncall.unconfirmed_reminder`
  row for its technician, skipped while such a row exists for that shift already
- the scan result — a `remindersQueued` counter next to `offerScanned`

## Task

1. `apps/api/src/oncall/coupling.ts`: add `enqueueOncallReminders` — one select over
   `DRAFT`/`PLANNED` shifts with `startsAt` in `(now, now + reminder_unconfirmed_h)` and a
   not-null `userId`, then the idempotency check (no `PENDING`/`SENT` row with this `shift_id`
   and `event_type = 'oncall.unconfirmed_reminder'`) and `enqueueOncallOutbox` per shift, one
   transaction per shift; report the counter.
2. `apps/api/src/jobs/escalation.ts`: run the sweep after `escalateOnCallOffers` in the existing
   per-minute `ticket-escalation` job and log only aggregate counters, never a shift id.
3. `reminder-notification.integration.spec.ts`: a shift inside the reminder window yields
   exactly one row for its technician, a second scan writes nothing, a shift outside the window
   or already `CONFIRMED` yields nothing, and the counters of the scan result are asserted.

## Non-goals

- No second pg-boss queue and no new cron entry: the `ticket-escalation` queue carries it.
- No message content change (WP-M14-28) and no change of the warnings route of WP-M8-10.
- No new notification setting: `oncall.reminder_unconfirmed_h` is the deadline.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
