# WP-M31-04: the data model of the customer portal

format: ctx-256k
status: planned
depends-on: WP-M31-03
phase: 31
milestone: m31
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.9 (the data model), §19.2, §19.3, §19.6
spec-lines: 40
changed-lines: 320

files-read:

- specs/19-customer-portal.md §19.9 (the data model of the phase)
- apps/api/src/db/schema.ts (the tables `users`, `objects`, `tickets`, `sessions`)
- apps/api/src/db/migrations/0061_drop_notification_preferences.sql (the style of a migration)
- apps/api/src/db/migrations/meta/_journal.json (the register of the migrations)
- apps/api/src/db/**tests**/ticketTables.integration.spec.ts (the pattern of a migration test)
- apps/api/src/db/**tests**/helpers/testDatabase.ts (the database of the tests)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0062_customer_portal.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/**tests**/customerPortal.integration.spec.ts

interfaces:

- `account_tokens` — the one-time links of the registration and of the forgotten password
- `object_assignments` — the trained person of an object
- `users.created_via` — how an account came into existence
- `tickets.customer_user_id` — the customer of the ticket
- `tickets.customer_email_notifications` — the opt-in of the reporter
- `tickets.trained_person_confirmed` — the confirmation of the reporter

## Task

1. **The migration** `0062_customer_portal.sql`: the table `account_tokens`
   (the user, the purpose, the hash of the token, the expiry, the moment of
   the use), the table `object_assignments` (the object, the customer, the
   user who created the row, the time), the column `users.created_via`, the
   column `tickets.customer_user_id` with `ON DELETE SET NULL`, the column
   `tickets.customer_email_notifications` and the column
   `tickets.trained_person_confirmed` — with the unique index of the pair
   (object, customer), the unique index of the hash of the token and the
   checks of the purpose and of the way an account came into existence.
2. **The schema** `apps/api/src/db/schema.ts` carries the two tables and the
   three columns.
3. **The journal** `meta/_journal.json` registers the migration.
4. **The test** `apps/api/src/db/__tests__/customerPortal.integration.spec.ts`
   proves the unique pair, the unique hash of the token, the check of the
   purpose, the check of `created_via` and the `SET NULL` of the customer of
   a ticket when the customer is deleted.

## Non-goals

- No route and no service — the tables come first.
- No change of the tables of the office.
- No backfill: the rows of the older version keep their behaviour.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration runs against the database of the tests and
the new test fails before the migration and passes after it.

## Handoff

- Files changed: the schema, the migration, the journal and the test of the
  migration
- Interfaces added: the two tables and the three columns
- Verified: the commands above
- Follow-up WP: WP-M31-05 — the object carries its trained people
- Open question: none
