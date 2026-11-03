# WP-M2-19a: DB migration for ticket workflow columns

format: small-model
status: implemented
depends-on: WP-M2-04
phase: 4
context-budget: 12k tokens
spec: PLAN.md §6 (tickets table workflow columns), PLAN.md §7 (ticket workflow)
spec-lines: 20

files-read:

- apps/api/src/db/migrations/0004_ticket_tables.sql — existing ticket table definition

files-write:

- apps/api/src/db/migrations/0006_ticket_workflow_columns.sql — ALTER TABLE adding
  assigned_user_id, reviewed_by_user_id, review_started_at, offered_to_user_id,
  offer_escalated_at, work_order_type, work_order_number, accepted_at,
  first_response_at, acknowledged_at, closed_at plus FKs and index

interfaces:

- New nullable columns on `tickets` for the workflow phase 4:
  `assigned_user_id`, `reviewed_by_user_id`, `review_started_at`,
  `offered_to_user_id`, `offer_escalated_at`, `work_order_type`,
  `work_order_number`, `accepted_at`, `first_response_at`,
  `acknowledged_at`, `closed_at`

## Task

1. `apps/api/src/db/migrations/0006_ticket_workflow_columns.sql`: add the workflow
   columns to `tickets` via ALTER TABLE, with foreign keys to `users` for the
   actor columns and an index on `(assigned_user_id, status)` for the list view.

## Non-goals

- transitionTicket() function (WP-M2-19b)
- Workflow API routes (WP-M2-19c)
- Workflow UI actions (WP-M2-19d)
- ticket_pauses table (phase 6)

## Acceptance

```bash
npm run wp:check
```

Expected: wp:check green. Migration SQL is applied via `npm run db:migrate` against a
real PostgreSQL 16 (skipped locally without a database).

## Handoff

- Files changed: the migration file above
- Follow-up WP: WP-M2-19b (transitionTicket function)
