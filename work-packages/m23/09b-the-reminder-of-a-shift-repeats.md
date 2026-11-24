# WP-M23-09b: the reminder of a shift repeats

format: small-model
status: done
depends-on: WP-M23-09a
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.6
spec-lines: 30

files-read:

- apps/api/src/oncall/coupling.ts (the sweep of the unconfirmed shifts)
- apps/api/src/notifications/outbox.ts (the rows of the outbox for a shift)
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts (the test of the sweep)
- specs/04-oncall.md §4a.6 (the rules of the reminders)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts
- apps/api/src/notifications/outbox.ts
- specs/04-oncall.md

interfaces:

- `enqueueOncallReminders(database, env, now)` — queues the reminder of a shift
  that was not accepted; the sweep repeats it after
  `oncall.reminder_repeat_h` hours and carries the number of the reminder
- the target of a readiness row carries `reminderNumber` — how often the office
  asked the technician

## Task

1. The sweep of `apps/api/src/oncall/coupling.ts` reminds a shift once: it
   skips the shift while a row of the event `oncall.unconfirmed_reminder` is
   `PENDING` or `SENT` — and a sent row stays in the table, so the shift is
   never reminded again.
2. The new rule counts the reminders of the shift and reminds again after
   `oncall.reminder_repeat_h` hours (WP-M23-09a), as long as the shift starts
   inside the window of `oncall.reminder_unconfirmed_h` and nobody accepted it.
3. The row of the sweep carries the number of the reminder in its target
   (`reminderNumber`), so the history of the shift shows how often the office
   was asked and the urgency of the message can rise (WP-M23-09d).
4. Name the rule in `specs/04-oncall.md` §4a.6.

## Non-goals

- No urgency yet — WP-M23-09d carries the level of the message.
- No route for the manual reminder — WP-M23-09e.
- No change of the confirmation and of the decline.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the sweep, its test, the outbox and the spec
- Interfaces added: the field `reminderNumber` in the target of a readiness row
- Verified: the commands above
- Follow-up WP: WP-M23-09c, WP-M23-09d, WP-M23-09e, WP-M23-09f
- Open question: none
