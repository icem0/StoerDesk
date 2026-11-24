# WP-M24-05: the own accounts of the user carry their state

format: small-model
status: planned
depends-on: WP-M24-04
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.3, §11.3a, §11.11
spec-lines: 30

files-read:

- apps/api/src/notifications/routes.ts (the routes of the accounts)
- apps/api/src/notifications/accounts.ts (the accounts of the user)
- apps/api/src/notifications/web-push-subscriptions.ts (the devices of the browser)

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/accounts.ts
- apps/api/src/notifications/__tests__/accounts.integration.spec.ts

interfaces:

- `GET /api/v1/notifications/accounts` — the own accounts with the state `missing | linked | ready`
- `notificationAccountListResponseSchema` — the answer with the accounts and the devices

## Task

1. Implement the route `GET /api/v1/notifications/accounts` that §11.11 has
   promised since phase 14: the own accounts of the user with their state
   (`missing`, `linked`, `ready`) and the count of the web-push devices.
2. Extend the service so the answer of an account carries the target, the time
   of the confirmation and the state.
3. Write the test of the route.

The state of a channel in the interface stops being a guess of the page: it is
the answer of the server.

## Non-goals

- No UI.
- No confirmation of the account — WP-M24-08.
- No change of the delivery.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the state of a linked account and of a
confirmed one.

## Handoff

- Files changed: the routes, the accounts, the test
- Interfaces added: the route of the own accounts
- Verified: the commands above
- Follow-up WP: WP-M24-08 — the code over the channel confirms the account
- Open question: none
