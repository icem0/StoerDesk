# WP-M23-09a: the reminder of a shift repeats

format: small-model
status: planned
depends-on: WP-M23-09
phase: 23
milestone: m23
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.6
spec-lines: 30

files-read:

- apps/api/src/oncall/coupling.ts (the sweep of the unconfirmed shifts)
- apps/api/src/oncall/settings.ts (the settings of the readiness)
- packages/shared/src/oncall.ts (the resolved settings of the readiness)
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts (the test of the sweep)

files-write:

- apps/api/src/oncall/coupling.ts
- apps/api/src/oncall/settings.ts, packages/shared/src/oncall.ts
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json, specs/04-oncall.md

interfaces:

- `oncall.reminder_repeat_h` — the new setting: the hours between two reminders
  of a shift that was not accepted; the default is `4`, the range is `1`–`72`
- `enqueueOncallReminders(database, env, now)` — queues the reminder of a shift
  that was not accepted; every further reminder carries its number

## Task

1. The sweep of `apps/api/src/oncall/coupling.ts` reminds a shift once: it skips
   the shift while a row of the event `oncall.unconfirmed_reminder` is `PENDING`
   or `SENT` — and a sent row stays in the table, so the shift is never reminded
   again. The new rule counts the rows of the shift and reminds again after
   `oncall.reminder_repeat_h` hours, as long as the shift starts inside the
   window of `oncall.reminder_unconfirmed_h` and nobody accepted it.
2. The new setting `oncall.reminder_repeat_h` joins the keys of the readiness
   (`apps/api/src/oncall/settings.ts`, `packages/shared/src/oncall.ts`): the
   default is `4` hours, the range is `1`–`72`, an invalid value falls back to
   the default like every other key.
3. The row of the sweep carries the number of the reminder in its target, so
   the history of the shift shows how often the office was asked.
4. Name the setting and the rule in `specs/04-oncall.md` §4a.6 and in the
   administration of the readiness.

## Non-goals

- No urgency yet — WP-M23-09b carries the level of the message.
- No route for the manual reminder — WP-M23-09c.
- No change of the confirmation and the decline.

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

- Files changed: the sweep, the settings of the readiness, the shared contract,
  the test, the locales and the spec
- Interfaces added: `oncall.reminder_repeat_h`
- Verified: the commands above
- Follow-up WP: WP-M23-09b, WP-M23-09c, WP-M23-09d
- Open question: none
