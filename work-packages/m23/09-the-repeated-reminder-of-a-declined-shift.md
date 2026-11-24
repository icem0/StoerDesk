# WP-M23-09: the repeated reminder of a shift that was not accepted

format: small-model
status: planned
depends-on: WP-M23-01
phase: 23
milestone: m23
context-budget: 24k tokens
spec: specs/04-oncall.md §4a.4, §4a.6, specs/10-notifications.md §11.4
spec-lines: 40

files-read:

- apps/api/src/oncall/coupling.ts (the sweep of the unconfirmed shifts)
- apps/api/src/jobs/escalation.ts (the job that runs the sweep)
- specs/10-notifications.md (the rules of the outbox and the urgency)
- apps/web/src/features/oncall/planning-section.tsx (the weekly plan of the readiness)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/jobs/escalation.ts
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts
- apps/web/src/features/oncall/planning-section.tsx, apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json, specs/04-oncall.md

interfaces:

- `enqueueOncallReminders(database, env, now)` — queues the reminder of a shift
  that was not accepted; the sweep repeats it and raises the urgency with every
  further reminder
- `POST /api/v1/oncall/shifts/:id/remind` — the admin of the readiness sends
  the reminder of one shift by hand; the guard is `oncall.admin`

## Task

The package is split into four children — every child is a commit of its own:

1. **WP-M23-09a** — the sweep repeats the reminder of a shift that was not
   accepted: today it queues one `oncall.unconfirmed_reminder` per shift and
   skips the shift while such a row is `PENDING` or `SENT`. The new rule counts
   the reminders of a shift and sends a further one after the configured
   interval; the row of the sweep carries the number of the reminder, so the
   history of the shift shows how often the office was asked.
2. **WP-M23-09b** — the urgency of the notification rises with every further
   reminder: the channel selection of `specs/10-notifications.md` §11.4 reads
   the urgency of the event, so a shift that was not accepted for a long time
   arrives louder than the first reminder. The rules of the channels and the
   fallback chain stay as they are.
3. **WP-M23-09c** — the admin of the readiness sends the reminder of one shift
   by hand: `POST /api/v1/oncall/shifts/:id/remind` (`oncall.admin`).
4. **WP-M23-09d** — the button „Erinnern" in the list of the open shifts of
   the readiness view.

## Non-goals

- No change of the confirmation and the decline themselves.
- No new permission key — `oncall.admin` and `oncall.plan` stay as they are.
- No change of the channels and of the fallback chain of the notifications.
- No change of the plan of a pool and of the duty blocks.

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

- Files changed: the sweep of the reminders, the job that runs it, its test, the
  list of the open shifts of the readiness view, the locales and the spec
- Interfaces added: `POST /api/v1/oncall/shifts/:id/remind`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
