# WP-M28-04b: the assertions of the migrations read the schema of the database — the second part

format: ctx-256k
status: planned
depends-on: WP-M28-04
phase: 28
milestone: m28
context-budget: 50k tokens
spec: PLAN.md §18.2 (the database of the integration tests)
spec-lines: 30
changed-lines: 329

files-read:

- apps/api/src/db/__tests__/schema.integration.spec.ts (the first part of the assertions)
- apps/api/src/db/migrations/0020_oncall_tables.sql (the tables of the on-call)
- apps/api/src/db/migrations/0019_notification_outbox.sql (the outbox)
- apps/api/src/db/migrations/0027_webhooks.sql (the webhooks)
- apps/api/src/db/migrations/0054_ticket_without_object.sql (the reserved object)

files-write:

- apps/api/src/db/__tests__/schema.integration.spec.ts
- work-packages/m28/

interfaces:

- `schema.integration.spec.ts` — the schema of the database, proven against the database: the on-call tables, the notifications, the users, the administration, the webhooks, the purges and the configuration

## Task

**WP-M28-04** moved the assertions of the text of the migration files into
`schema.integration.spec.ts` — the base tables, the RBAC catalog and the ticket
tables. The second part proves the rest of the schema against the database.

1. **The on-call** `schema.integration.spec.ts`: the tables of the migration
   `0020` exist, a pool name may not be empty, a state of a shift that the
   instance does not know is refused, a pool holds one shift per start, the
   shifts of a pool go with the pool, and the history of a shift is protected
   against a change.
2. **The notifications** `schema.integration.spec.ts`: the tables of the outbox
   exist, a row of the outbox waits as `PENDING` without an attempt, a state
   that the instance does not know is refused, a kind of channel is unique, an
   account knows its target and its confirmation, and the table of the
   selection per event type is gone.
3. **The users** `schema.integration.spec.ts`: a new account has the theme
   `auto` and no open password change, a theme that the instance does not know
   is refused, the family name is derived from the mail address, and a name
   that is longer than 64 characters is refused.
4. **The administration** `schema.integration.spec.ts`: an api key keeps only
   the hash of its token, a scope that the instance does not know is refused, a
   ticket names the channel and the kind of its reporter, a channel of the
   reporter that the instance does not know is refused, and an update run
   knows the detail of its failure.
5. **The webhooks and the purges** `schema.integration.spec.ts`: the tables of
   the webhooks exist, an event that the instance does not know is refused, a
   state of a delivery that the instance does not know is refused, the log of
   the purges is protected against a change, and a reason of a purge that is
   longer than 1000 characters is refused.
6. **The configuration** `schema.integration.spec.ts`: the instance knows the
   statuses of the workflow and the reserved object without an object — the
   rows the migrations wrote, which the pool restores after every file.

## Non-goals

- No change of the schema, of a migration and of the code of the API.
- No change of the first part of the file (**WP-M28-04**).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the file of the schema proves the whole schema against the
database.

## Handoff

- Files changed: the file of the schema
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none
- Open question: none
