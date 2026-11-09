# WP-M9-02: `tickets.is_test` flag and migration 0023

format: small-model
status: done
depends-on: WP-M9-01
phase: 9
milestone: m9
context-budget: 12k tokens
spec: specs/11-dashboard.md §11.3; specs/12-stats.md §12.1; ADR-0012 decision 5
spec-lines: 40

files-read:

- specs/11-dashboard.md (§11.3 fault-free counter)
- specs/12-stats.md (§12.1 filters)
- apps/api/src/db/schema.ts (`tickets` table and its checks)
- apps/api/src/db/migrations/0018_user_klarmname.sql (migration style)
- apps/api/src/db/migrations/0022_rbac_admin_only_protected.sql (latest migration number)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (database test setup)

files-write:

- apps/api/src/db/migrations/0023_ticket_is_test.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts

interfaces:

- `tickets.is_test` boolean, not null, default `false`
- `NewTicketRow.isTest` / `TicketRow.isTest` through the Drizzle infer types

## Task

1. Add migration `0023_ticket_is_test.sql`: `ALTER TABLE tickets ADD COLUMN
   is_test boolean NOT NULL DEFAULT false` plus the partial index
   `tickets_is_test_reported_at_idx` over `reported_at` where `is_test = false`
   for the counter range query.
2. Declare the column in `apps/api/src/db/schema.ts` as
   `isTest: boolean('is_test').notNull().default(false)` and add the index to
   the table's index list, so the snapshot chain stays complete.
3. Extend the ticket-table integration test: a default insert is `false`, an
   explicit `true` survives, and the column is `NOT NULL`.
4. Do not touch any route, service or UI; the read path starts in WP-M9-05.

## Non-goals

- No user-facing test toggle and no seed change.
- No statistics view (WP-M9-03).
- No backfill of existing rows; the default `false` is correct for all of them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the database test runs when `TEST_DATABASE_URL` is set and
skips with a named reason otherwise.

## Handoff

- Files changed: migration 0023, the ticket schema declaration, the ticket-table test
- Interfaces added: `tickets.is_test`, `TicketRow.isTest` / `NewTicketRow.isTest`
- Verified: typecheck, lint, targeted `test:run`, `wp:check`
- Follow-up WP: WP-M9-03 (statistics views use the flag)
- Open question: none
