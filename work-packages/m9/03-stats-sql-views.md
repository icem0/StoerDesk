# WP-M9-03: statistics SQL views and migration 0024

format: small-model
status: done
depends-on: WP-M9-02
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/12-stats.md §12.7; ADR-0012 decision 2
spec-lines: 45

files-read:

- specs/12-stats.md (§12.7 SQL views, §12.2 pauses, §12.3 frequency)
- apps/api/src/db/schema.ts (`tickets`, `objects`, `ticketPauses`, `ticketEvents`)
- apps/api/src/db/migrations/0014_ticket_pauses.sql (pause columns)
- apps/api/src/db/migrations/0004_ticket_tables.sql (ticket columns and indexes)
- apps/api/src/db/migrations/meta/_journal.json (journal entry format)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (view test setup)

files-write:

- apps/api/src/db/migrations/0024_stats_views.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/__tests__/statsViews.integration.spec.ts

interfaces:

- `stats_tickets` view — one row per ticket with object, workflow timestamps, `is_test`, `suspected_spam` and summed `pause_seconds`
- `stats_ticket_faults` view — one row per ticket and `fault_template_keys` entry

## Task

1. Create the view `stats_tickets` over `tickets` joined to `objects`: ticket
   number, object id/number/name, `external_type` as `system_type`, priority,
   source, status, assigned user, `reported_at`, `review_started_at`,
   `first_response_at`, `acknowledged_at`, `closed_at`, `deadline_at`,
   `is_test`, `suspected_spam` and `pause_seconds` from a correlated sum over
   `ticket_pauses`.
2. Create the view `stats_ticket_faults` with `ticket_id`, `reported_at`,
   `fault_template_key` and the filter columns of `stats_tickets`, built on
   `unnest(tickets.fault_template_keys)`.
3. Add the journal entry `0024_stats_views` after `0023_ticket_is_test`, in the
   style of the existing hand-written migrations.
4. Add a database integration test: it migrates, inserts a ticket with a pause
   and two fault keys, and asserts both views answer the expected row counts and
   the summed pause seconds. It skips with a named reason without
   `TEST_DATABASE_URL`.

## Non-goals

- No materialized view and no refresh job (ADR-0012 decision 2).
- No statistics query service, route or UI.
- No Drizzle view declaration; the views are read through SQL in WP-M9-10/11.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration applies to a fresh database and the view
test passes or skips with a named reason.

## Handoff

- Files changed: migration 0024, the journal, the statistics-view test
- Interfaces added: the two statistics views
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-10 and WP-M9-11 read the views
- Open question: none
