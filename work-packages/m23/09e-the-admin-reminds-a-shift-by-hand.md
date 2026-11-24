# WP-M23-09e: the admin reminds a shift by hand

format: small-model
status: planned
depends-on: WP-M23-09b
phase: 23
milestone: m23
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.8
spec-lines: 30

files-read:

- apps/api/src/oncall/routes.ts (the routes of the readiness)
- apps/api/src/oncall/coupling.ts (the sweep of the reminders)
- apps/api/src/oncall/__tests__/routes.integration.spec.ts (the test of the routes)
- specs/04-oncall.md §4a.8 (the table of the API)

files-write:

- apps/api/src/oncall/routes.ts
- apps/api/src/oncall/coupling.ts
- apps/api/src/oncall/__tests__/routes.integration.spec.ts
- specs/04-oncall.md

interfaces:

- `POST /api/v1/oncall/shifts/:id/remind` — the admin of the readiness sends the
  reminder of one shift by hand; the guard is `oncall.admin`
- `enqueueOncallReminder(database, env, shift)` — the reminder of one shift,
  outside the sweep

## Task

1. The route `POST /api/v1/oncall/shifts/:id/remind` (guard `oncall.admin`)
   writes the reminder of one shift: the technician of the shift is asked again,
   outside the sweep of WP-M23-09b and without the wait of the interval.
2. The route refuses a shift that started (the reminder of a shift in the past
   is pointless) and a shift without a technician — the shift has nobody to
   ask. The answers name the cause: `409 oncall_shift_started` and
   `409 oncall_invalid_shift_state`.
3. The reminder of the route carries the number of the next reminder, so the
   urgency of the message of WP-M23-09d rises like the urgency of the sweep.
4. The route joins the table of the API in `specs/04-oncall.md` §4a.8.

## Non-goals

- No change of the confirmation and of the decline.
- No new permission key — `oncall.admin` stays as it is.
- No UI in this package — WP-M23-09f carries the button.

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

- Files changed: the routes of the readiness, the sweep of the reminders, the
  test of the routes and the spec
- Interfaces added: `POST /api/v1/oncall/shifts/:id/remind`
- Verified: the commands above
- Follow-up WP: WP-M23-09f
- Open question: none
