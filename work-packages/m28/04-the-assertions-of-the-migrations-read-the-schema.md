# WP-M28-04: the assertions of the migrations read the schema of the database

format: ctx-256k
status: done
depends-on: —
phase: 28
milestone: m28
context-budget: 60k tokens
spec: PLAN.md §18.2 (the database of the integration tests)
spec-lines: 30
changed-lines: 781

files-read:

- apps/api/src/db/__tests__/migrations.spec.ts (the assertions of the migration files)
- apps/api/src/db/__tests__/baseTables.integration.spec.ts (the style of a schema test)
- apps/api/src/db/schema.ts (the tables of the schema)
- apps/api/src/db/migrations/0001_rbac_tables.sql (the protection of the system roles)
- apps/api/src/db/migrations/0004_ticket_tables.sql (the history of a ticket)
- apps/api/src/db/migrations/0020_oncall_tables.sql (the tables of the on-call)
- apps/api/src/db/migrations/0024_ticket_purges_append_only.sql (the log of the purges)

files-write:

- apps/api/src/db/__tests__/migrations.spec.ts
- apps/api/src/db/__tests__/schema.integration.spec.ts
- work-packages/m28/

interfaces:

- `migrations.spec.ts` — the journal of the migrations: the files, their order and their timestamps
- `schema.integration.spec.ts` — the schema of the database, proven against the database

## Task

The file `migrations.spec.ts` read the **text** of the migration files and
searched it for fragments of SQL: `expect(sql).toContain('CREATE TABLE
"tickets"')`. Forty-eight cases did that. Such an assertion says nothing about
the database — it breaks when a migration is written differently, and it
passes when the migration was never run.

1. **The journal** `migrations.spec.ts`: what really is about the files stays —
   the journal names every migration file once, the numbers follow each other,
   the timestamps are the milliseconds that Drizzle compares, and the two
   schemas of the base tables and of the RBAC catalog keep their columns. The
   journal is read once instead of once per case.
2. **The schema** `schema.integration.spec.ts`: every assertion of the text
   became an assertion of the real database — the table exists, the
   constraint refuses the row that breaks it, the trigger protects the row.
   The first part proves the base tables, the RBAC catalog and the ticket
   tables; the second part (**WP-M28-04b**) proves the on-call tables, the
   tables of the notifications, the columns of the users, the tables of the
   administration, the webhooks, the purges and the configuration of the
   instance.

## Non-goals

- No change of the schema, of a migration and of the code of the API.
- No change of a test of another file.
- No removal of a case: every assertion of the text has an assertion of the
  database now, and the ones that only described the writing of a migration
  (the order of two statements in a file) are gone with the text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new file proves the schema against the database, and
the file of the journal proves the files.

## Handoff

- Files changed: the file of the journal and the new file of the schema
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: **WP-M28-04b** (the second part of the schema: the on-call
  tables, the notifications, the users, the administration, the webhooks, the
  purges and the configuration of the instance)
- Open question: none
