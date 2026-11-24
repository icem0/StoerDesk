# WP-M24-02: the accounts carry their target and their confirmation

format: small-model
status: planned
depends-on: WP-M24-01
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.3, §11.3a, §11.10
spec-lines: 40

files-read:

- apps/api/src/db/schema.ts (the tables of the notification layer)
- apps/api/src/db/migrations/0057_notification_event_assignment_answered.sql (the last migration)
- apps/api/src/notifications/accounts.ts (the accounts of the users)
- apps/api/src/notifications/preferences.ts (the selection that ends here)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0060_notification_account_target_and_verification.sql
- apps/api/src/db/__tests__/migrations.spec.ts

interfaces:

- `notification_accounts.target` — the target of the user at the channel (the room of the user for Matrix)
- `notification_accounts.verified_at` — the time of the confirmation of the account
- `notification_preferences` — **removed**: the selection per event type is gone

## Task

1. Add the columns `target` (text, empty by default) and `verified_at`
   (timestamp, nullable) to `notification_accounts` and drop the table
   `notification_preferences` with its index.
2. Write the migration `0058`: the two columns, the drop of the table. The
   migration is reversible — the columns come back, the table comes back empty.
3. Update the schema of Drizzle and the test of the migrations.

## Non-goals

- No route and no service in this WP.
- No change of the outbox — the code that reads the selection breaks until
  WP-M24-06 removes it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the migrations knows the new columns and the
dropped table.

## Handoff

- Files changed: the schema, the migration, the test of the migrations
- Interfaces added: the two columns of the account
- Verified: the commands above
- Follow-up WP: WP-M24-03 — the shared contracts of the policy, the account and the compliance
- Open question: none
