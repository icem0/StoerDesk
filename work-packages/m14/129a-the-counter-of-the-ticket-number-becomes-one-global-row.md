# WP-M14-129a: the counter of the ticket number becomes one global row

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/02-data-model.md §4.11, §4.8; PLAN.md §6, §17; ADR-0027
spec-lines: 40

depends-on: WP-M14-129, WP-M2-04

files-read:

- apps/api/src/db/migrations/0004_ticket_tables.sql (`ticket_no_counters`, `next_ticket_no()`)
- apps/api/src/db/schema.ts (`ticketNoCounters`, `tickets.ticketNo`, `TicketNoCounter`)
- specs/02-data-model.md (§4.11, ADR-0027)
- docs/DECISIONS/0027-ticket-number-without-year.md

files-write:

- apps/api/src/db/migrations/0048_ticket_no_counter_global.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- docs/REPO-MAP.md (the row of migration `0004` and the `ticket_no_counters` mention)

interfaces:

- `next_ticket_no() → text` — redefined: `ST-` plus the global counter padded to
  four digits, no calendar year
- `ticketNoCounter` — the Drizzle mirror of `ticket_no_counter` (`key`, `nextValue`)
- `TicketNoCounter = typeof ticketNoCounter.$inferSelect`

## Task

ADR-0027 decision 1, 2, 3 and 4 — the database layer only.

1. `0048_ticket_no_counter_global.sql` (hand-written, with a leading comment and
   `--> statement-breakpoint` separators like `0040`):
   a. `CREATE TABLE "ticket_no_counter" ( "key" text PK NOT NULL, "next_value" integer NOT NULL )`,
   b. seed the single row idempotently: insert `global` with the highest
   `next_value` `ticket_no_counters` ever held (`COALESCE(MAX(…), 0)`),
   `ON CONFLICT (key) DO NOTHING`, so a new number never counts below an old one,
   c. `DROP TABLE "ticket_no_counters"` — its yearly counters are history,
   d. `CREATE OR REPLACE FUNCTION next_ticket_no()` allocating through
   `INSERT … ON CONFLICT (key) DO UPDATE SET next_value = next_value + 1 RETURNING
   next_value` and returning `'ST-' || lpad(allocated::text, 4, '0')`.
2. Add the journal entry `idx: 48`, `tag: "0048_ticket_no_counter_global"`,
   `breakpoints: true` with the next `when` timestamp.
3. `apps/api/src/db/schema.ts`: rename the exported table to `ticketNoCounter`
   with `key: text('key').primaryKey()` and `nextValue: integer('next_value')`,
   keep the JSDoc pointing at §4.11 and ADR-0027 and drop the year wording, and
   rename the inferred type at the export list. `tickets.ticketNo` keeps its
   default `sql\`next_ticket_no()\`` unchanged.
4. `docs/REPO-MAP.md`: the row of `0004_ticket_tables.sql` states that `next_ticket_no()`
   produced the yearly `ST-<year>-NNNN` number there and that migration `0048`
   (WP-M14-129a) replaced the counter with one global row.

## Non-goals

- No change of `ticketNoSchema` and of any route guard (WP-M14-129b).
- No change of `tickets.ticket_no` itself, of its unique index or of any existing
  row: numbers are never rewritten and never re-used.
- No test change (WP-M14-129c), no i18n, no UI.
- No offset or random counter start (deferred in ADR-0027).

## Acceptance

```bash
npm run db:migrate -w @stoerdesk/api
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: green. Without a reachable PostgreSQL the integration specs are
skipped and report **unverified** (`PLAN.md` §18) — they are not presented as
green.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-129b (the shared contract)
- Open question: none
