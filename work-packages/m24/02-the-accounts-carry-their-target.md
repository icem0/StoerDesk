# WP-M24-02: the accounts carry their target and their confirmation

format: small-model
status: done
depends-on: WP-M24-01
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.3, §11.3a, §11.10
spec-lines: 40

files-read:

- apps/api/src/db/schema.ts (the tables of the notification layer)
- apps/api/src/db/migrations/0059_oncall_shift_pattern.sql (the last migration)
- apps/api/src/db/__tests__/migrations.spec.ts (the test of the migrations)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0060_notification_account_target_and_verification.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/__tests__/migrations.spec.ts

interfaces:

- `notification_accounts.target` — the target of the user at the channel (the room of the user for Matrix)
- `notification_accounts.verified_at` — the time of the confirmation of the account

## Task

1. Add the columns `target` (text, empty by default) and `verified_at`
   (timestamp, nullable) to `notification_accounts` in the schema of Drizzle.
2. Write the migration `0060` and register it in the journal.
3. Extend the test of the migrations: the two columns, the empty default and
   the promise that the migration touches the accounts only.

The drop of the table `notification_preferences` does not belong to this
package: the code that reads the selection (`preferences.ts`, `receivers.ts`,
`outbox.ts`, the routes) goes with it — WP-M24-06 removes the selection and
drops the table in the same commit, so no gate is ever red.

## Non-goals

- No route and no service in this WP.
- No drop of `notification_preferences` — it goes with the code that reads it.
- No change of the outbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the migrations knows the two new columns.

## Handoff

- Files changed: the schema, the migration, the journal, the test of the
  migrations
- Interfaces added: the two columns of the account
- Verified: the commands above
- Follow-up WP: WP-M24-03 — the shared contracts of the policy, of the account
  and of the compliance; WP-M24-06 — the delivery over the channels of the user
  and the end of the selection per event type
- Open question: none
