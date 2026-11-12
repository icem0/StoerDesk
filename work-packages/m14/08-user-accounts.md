# WP-M14-08: The accounts of the users

format: small-model
status: planned
depends-on: WP-M14-04
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.3; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.3
- apps/api/src/notifications/config.ts (the service of WP-M14-04)
- apps/api/src/db/schema.ts (the table of WP-M14-04)
- apps/api/src/privacy/routes.ts (the write-only pattern of ADR-0005)

files-write:

- apps/api/src/notifications/accounts.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `listAccounts(database, userId): Promise<NotificationAccount[]>`
- `storeAccount(database, userId, account): Promise<NotificationAccount>`
- `deleteAccount(database, userId, channel): Promise<boolean>`
- `NotificationAccount` — channel, externalId, label, secretSet

## Task

1. `apps/api/src/notifications/accounts.ts` reads, stores and removes the
   account of a user: at most one account per channel
   (`unique (user_id, channel)`).
2. The answer of an account carries `secretSet: boolean` and never the secret;
   the secret of an account is stored like the secret of a channel —
   write-only, never logged, never part of an event payload.
3. The shared contracts of `packages/shared/src/schemas/notification.ts` name
   the account, its channel and its external id; the channel is one of the
   kinds of §11.1.
4. A unit test proves that the secret of an account never leaves the service
   and that the account of a user is never visible to another user.

## Non-goals

- No route — the routes of the accounts are WP-M14-09 and WP-M14-11.
- No Telegram code, no Matrix check, no bridge.
- No change of the table (it is created by the migration of WP-M14-04).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the service stores an account, answers it without the
secret and removes it again.

## Handoff

- Files changed: the new account service, the shared contracts and the tests
- Interfaces added: `listAccounts`, `storeAccount`, `deleteAccount`
- Verified: `npm run check`
- Follow-up WP: WP-M14-09 — the Telegram linking via a one-time code
- Open question: none
