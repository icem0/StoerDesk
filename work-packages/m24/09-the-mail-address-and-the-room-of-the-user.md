# WP-M24-09: the mail address of the user and the room of the user

format: small-model
status: done
depends-on: WP-M24-08
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.3, §11.3a, §11.11, ADR-0046
spec-lines: 30

files-read:

- apps/api/src/notifications/matrix-linking.ts (the linking of the Matrix account)
- apps/api/src/notifications/accounts.ts (the accounts of the user)
- packages/shared/src/schemas/notification.ts (the contracts of the chapter)

files-write:

- apps/api/src/notifications/matrix-linking.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `POST /api/v1/notifications/accounts/email` — the own mail address becomes the account of the e-mail channel
- `matrixLinkingRequestSchema.room` — the room of the user (a room id or a room alias)
- `notification_accounts.target` — the target of the user at the channel

## Task

1. Give the e-mail channel the account of the user: the route stores the own
   mail address as the account of the channel; the user proves it with the
   one-time code of §11.3a.
2. Give the Matrix account its target: the user enters the room of the
   messages — a room id or a room alias, which the server resolves with the
   token of the user. The target is stored in the `target` of the account.

## Non-goals

- No HTML body — WP-M24-10.
- No UI — WP-M24-16.
- No change of the confirmation — WP-M24-08.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the linking of Matrix, the routes, the shared contracts
- Interfaces added: the route of the mail address, the room of the Matrix account
- Verified: the commands above
- Follow-up WP: WP-M24-15 — the compliance of the users
- Open question: none
