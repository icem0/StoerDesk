# WP-M23-09g: the test of the manual reminder configures its own chain

format: small-model
status: done
depends-on: WP-M23-09e
phase: 23
milestone: m23
context-budget: 8k tokens
spec: specs/04-oncall.md §4a.6, §4a.8
spec-lines: 30

files-read:

- apps/api/src/oncall/__tests__/routes.integration.spec.ts (the test of the routes)
- apps/api/src/oncall/coupling.ts (the reminder of one shift and its number)
- apps/api/src/notifications/outbox.ts (the rows of the outbox)
- apps/api/src/notifications/channels/index.ts (the chain of the instance)
- apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts (the test of the sweep)

files-write:

- apps/api/src/oncall/__tests__/routes.integration.spec.ts

interfaces:

- none — the route and the number of the reminder keep their meaning

## Task

1. The number of the reminder of a shift counts the reminders of the shift that
   went out: `enqueueOncallReminder` reads the rows of the outbox with the
   event `oncall.unconfirmed_reminder` and adds one. A row is written only when
   a channel carries the message — without a configured channel the chain of
   the instance is empty and the number stays `1`.
2. The test of WP-M23-09e therefore depended on the environment of the machine:
   the `.env` of a developer knows ntfy, the runner of the check run knows no
   channel at all. The second reminder of the test expected the number `2` and
   got `1` — the check run of the version of WP-M25-01 failed on that test and
   on nothing else.
3. The test configures the chain of the instance itself, the way the test of
   the sweep does (`loadEnv` with `NTFY_URL` and `NTFY_TOPIC`): the reminder
   really goes out, the row of the outbox is written and the number of the
   second reminder rises to `2`. The test asserts the queued reminders of the
   first call as well, so the reason for the number is named.

## Non-goals

- No change of the route, of the service and of the number — the number of the
  reminder stays the number of the reminders that went out.
- No change of the sweep of the reminders — it counts the same rows.
- No new channel for the test — the chain of the instance is enough.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the manual reminder passes with and without a
channel in the environment of the machine.

## Handoff

- Files changed: the test of the routes of the readiness
- Interfaces added: none
- Verified: the commands above; the file of the test also runs with an
  environment without ntfy
- Note: the number of a reminder depends on the channel of the installation —
  an installation without a channel never delivers a reminder and its number
  stays `1`. The change of that coupling is a decision of the product, not a
  repair of this test.
- Follow-up WP: none
- Open question: none
