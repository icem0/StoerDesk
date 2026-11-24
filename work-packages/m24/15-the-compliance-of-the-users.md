# WP-M24-15: the compliance of the users

format: small-model
status: done
depends-on: WP-M24-09
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.9, §11.11, §11.13
spec-lines: 30

files-read:

- apps/api/src/notifications/receivers.ts (the channels of a user)
- apps/api/src/settings/notifications.ts (the rule of the administration)
- apps/api/src/db/schema.ts (the accounts and the users)

files-write:

- apps/api/src/notifications/compliance.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/compliance.integration.spec.ts

interfaces:

- `GET /api/v1/admin/notifications/compliance` — the users with their channels and the flag of the rule
- `GET /api/v1/notifications/compliance` — the compliance of the signed-in user
- `readCompliance(database)` — the compliance of every user of the instance

## Task

1. Write the compliance of the users: for every user the state of every
   channel — `missing`, `linked`, `ready` — the required channels he does not
   have set up, the number of the channels he has set up and the flag of the
   rule.
2. Add the two routes of §11.11: the list for the administration
   (`notification.read`) and the own compliance for the warning of the own
   page.
3. Write the test: a user with a confirmed channel is `ready`, a linked account
   is `linked` and the missing required channels are named.

The answer never names the address of a user (§11.13).

## Non-goals

- No UI — WP-M24-18 and WP-M24-19.
- No change of the rule — WP-M24-04.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the states of the channels and the
missing required channels.

## Handoff

- Files changed: the compliance, the routes, the test
- Interfaces added: the two routes of the compliance
- Verified: the commands above
- Follow-up WP: WP-M24-16 — the own page names the channels of the user
- Open question: none
