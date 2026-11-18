# WP-M14-129a: the year-free ticket number — the counter, the contract, the assertions

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/02-data-model.md §4.8, §4.11; specs/06-report-form.md §7.3.2; PLAN.md §6, §17; ADR-0027
spec-lines: 50

depends-on: WP-M14-129, WP-M2-04, WP-M9-29

files-read:

- apps/api/src/db/migrations/0004_ticket_tables.sql (`ticket_no_counters`, `next_ticket_no()`)
- apps/api/src/db/schema.ts (`ticketNoCounters`, `tickets.ticketNo`, `TicketNoCounter`)
- packages/shared/src/schemas/ticket.ts (`ticketNoSchema`)
- apps/api/src/tickets/workflow-routes.ts (the format guard of a `:ticketNo` path)
- specs/02-data-model.md (§4.11, ADR-0027)
- docs/DECISIONS/0027-ticket-number-without-year.md

files-write:

- apps/api/src/db/migrations/0048_ticket_no_counter_global.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `next_ticket_no() → text` — redefined: `ST-` plus the global counter padded to
  four digits, no calendar year
- `ticketNoCounter` — the Drizzle mirror of `ticket_no_counter` (`key`, `nextValue`)
- `TicketNoCounter = typeof ticketNoCounter.$inferSelect`
- `ticketNoSchema` — `^ST-(\d{4,}|\d{4}-\d{4,})$`: the year-free `ST-0001` **or**
  the legacy `ST-2026-0001`

## Task

ADR-0027 decisions 1, 2, 3, 4 and 5. The planned split of WP-M14-129 put the
database, the contract and the tests into three packages — the implementation
shows that they are one coupled slice: the migration alone writes `ST-0001`,
which the old `ticketNoSchema` rejects at every `:ticketNo` entry point, and the
assertions of the suites expect the old shape until the new one is generated.
One package, four source files, one green gate.

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
   point the JSDoc at §4.11 and ADR-0027 and drop the year wording, and rename
   the inferred type at the export list. `tickets.ticketNo` keeps its default
   `sql\`next_ticket_no()\`` unchanged.
4. `packages/shared/src/schemas/ticket.ts`: `ticketNoSchema` accepts the
   year-free `ST-0001` **or** the legacy `ST-2026-0001` (the SEC-015 guard of
   WP-M9-29 stays a format guard, it only knows both shapes now).
5. The assertions follow the new shape (test files, outside the source limit):
   the ticket tables spec expects `ST-NNNN` and reads a number of the yearly
   counter back unchanged, the report endpoint spec and the phase-10 exit
   criterion expect `ST-NNNN`, the two report E2E suites expect `ST-NNNN`, and
   the new unit test `packages/shared/src/__tests__/ticketNo.test.ts` proves
   both shapes parse and a malformed number does not.
6. Bookkeeping of the same commit: `docs/REPO-MAP.md`, `docs/SECURITY-PLAN.md`
   (the audit record), `CHANGELOG.md`, `PLAN.md` §16 and the backlog table.

## Non-goals

- No route change: every `:ticketNo` guard already calls `ticketNoSchema` and
  inherits the new rule.
- No change of `tickets.ticket_no` itself, of its unique index or of any existing
  row: numbers are never rewritten and never re-used.
- No i18n, no UI, no statistics change.
- No offset or random counter start (deferred in ADR-0027).

## Acceptance

```bash
npm run db:migrate -w @stoerdesk/api
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run test:e2e
npm run wp:check
```

Expected: green. Without a reachable PostgreSQL the integration specs are
skipped and report **unverified** (`PLAN.md` §18) — they are not presented as
green.

## Handoff

- Files changed: the migration `0048_ticket_no_counter_global.sql`, the journal
  entry `idx: 48`, the Drizzle mirror in `apps/api/src/db/schema.ts`, the shared
  contract in `packages/shared/src/schemas/ticket.ts`, the assertions of the
  suites and this file (plus the bookkeeping)
- Interfaces added: `ticketNoCounter` (the Drizzle mirror of `ticket_no_counter`),
  `TicketNoCounter`; `next_ticket_no()` keeps its name and returns `ST-0121`
  after a yearly counter of 120; `ticketNoSchema` knows both shapes
- Verified: `npm run check` green (typecheck, lint, vitest 205 files / 1415
  tests, `i18n:check`, `wp:check` and the e2e suite 14/14); the ticket tables
  integration spec ran against the test database (7/7, no skip); a scratch
  database migrated up to `0047` with the yearly rows `(2025, 120)` and
  `(2026, 42)` received the counter row `global = 120`, lost
  `ticket_no_counters` and allocated `ST-0121` and `ST-0122`
- Follow-up WP: WP-M14-129b (a number of the yearly counter still resolves
  through the API), WP-M14-129c (a malformed number is still rejected) — both
  files exist and run in numeric order
- Open question: none
