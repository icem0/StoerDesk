# WP-M14-38a: The ticket transition table in the database

format: small-model
status: done
depends-on: WP-M14-38
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.13, PLAN.md §7, §6; ADR-0025
spec-lines: 60

files-read:

- apps/api/src/db/schema.ts (`ticketStatuses`, `tickets`, `tickets_status_check`)
- apps/api/src/db/migrations/0034_ticket_statuses.sql, 0040_ticket_status_key_format.sql
- apps/api/src/db/migrations/0004_ticket_tables.sql (the `tickets_status_check`)
- apps/api/src/db/migrations/meta/_journal.json
- docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md

files-write:

- apps/api/src/db/migrations/0041_ticket_transitions.sql
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/meta/_journal.json

interfaces:

- `ticket_transitions { id, from_status, to_status, event_key, condition_json, active, created_at, updated_at }`
- foreign keys `from_status`/`to_status` → `ticket_statuses.key` with `ON DELETE cascade`
- unique index over `(from_status, event_key)`; `tickets_status_check` dropped

## Task

1. Migration `0041_ticket_transitions.sql`: create `ticket_transitions` with `id` (UUID v7,
   primary key), `from_status` and `to_status` (text, foreign keys to `ticket_statuses.key`,
   `ON DELETE cascade`), `event_key` (text, not null), `condition_json` (jsonb, nullable —
   stored, not evaluated), `active` (boolean, default `true`), `created_at` and `updated_at`;
   unique index `ticket_transitions_from_status_event_key_key` over `(from_status, event_key)`
   and an index over `to_status`.
2. Seed the `PLAN.md` §7 workflow in the migration (22 rows, `active = true`,
   `ON CONFLICT (from_status, event_key) DO NOTHING`): the steps of the current map
   and `cancelled` from each of the nine statuses — `NEW`/`review_started`,
   `IN_REVIEW`/`work_order_set`, `WORK_ORDER_CREATED`/`assigned` and `offered`,
   `OFFERED`/`claimed`, `accepted` and `declined`, `ASSIGNED`/`accepted` and
   `declined`, `ACCEPTED`/`acknowledged`, `ACKNOWLEDGED`/`closed`, `CLOSED`/`reopened`,
   `CANCELLED`/`uncancelled` and the nine `cancelled` rows.
3. Seed the nine `ticket_statuses` rows idempotently
   (`ON CONFLICT (key) DO NOTHING`) before those rows, because the foreign keys need
   them on a migrated database that never ran a seed; the values are the defaults of
   `apps/api/src/db/seed/statuses.ts` and both seedings must agree.
4. Drop the CHECK `tickets_status_check` of migration `0004` in the same migration
   (ADR-0025 decision 5): the rows of `ticket_statuses` are the status configuration.
5. Mirror the table in `apps/api/src/db/schema.ts` (`ticketTransitions`) and register
   the migration in `_journal.json`; run `npm run db:migrate`.

## Non-goals

- No shared contract, no service, no route, no UI (WP-M14-38b, WP-M14-38c, WP-M14-39).
- No change of `TRANSITIONS` in `apps/api/src/tickets/workflow.ts` and no change of
  `apps/api/src/db/seed/statuses.ts`.
- No evaluation of `condition_json` (WP-M14-41).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run db:migrate -w @stoerdesk/api
npm run test:run
npm run wp:check
```

Expected: all green; the migration applies to a fresh and to an installed database;
`ticket_transitions` carries exactly the 22 rows of `PLAN.md` §7; the nine statuses
exist on a migrated database without a seed; `tickets_status_check` is gone; the
existing workflow specs stay green; `npm run db:migrate` reports the journal up to
`0041`.

## Handoff

- Files changed: the migration, the schema, the journal, the `tickets_status_check`
  expectation in `apps/api/src/db/__tests__/ticketTables.integration.spec.ts` (test,
  outside the file count) and the repository bookkeeping
- Interfaces added: the `ticket_transitions` table and its columns, `ticketTransitions`
  in the schema mirror
- Verified: `npm run db:migrate` applied `0030 … 0041` (the tracker row of migration
  0029 was realigned with the journal's `when` first — the dev database had the row but
  no record for it); `ticket_transitions` carries exactly the 22 seeded active rows,
  `ticket_statuses` the nine defaults, `tickets_status_check` is gone; the full
  `npm run test:run` is green with the updated `ticketTables` spec
- Follow-up WP: WP-M14-38b (the shared contracts and the transition service)
- Open question: none
