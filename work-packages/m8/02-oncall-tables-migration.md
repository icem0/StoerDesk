# WP-M8-02: on-call tables and migration 0020

format: small-model
status: planned
depends-on: WP-M8-01
phase: 8
milestone: m8
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.2–§4a.5; specs/02-data-model.md §4.2, §4.12
spec-lines: 120

files-read:

- specs/04-oncall.md (§4a.2 pools, §4a.3 shifts, §4a.5 swaps)
- apps/api/src/db/schema.ts (`ticketEvents`, `ticketPauses`, `settings`)
- apps/api/src/db/migrations/0004_ticket_tables.sql (append-only trigger pattern)
- apps/api/src/db/migrations/0014_ticket_pauses.sql (table and index pattern)
- apps/api/src/db/migrations/meta/_journal.json (snapshot chain)
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (test pattern)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0020_oncall_tables.sql (generated)
- apps/api/src/db/migrations/meta/_journal.json (generated)
- apps/api/src/db/migrations/meta/0020_snapshot.json (generated)

interfaces:

- `oncallPools`, `oncallShifts`, `oncallSwapRequests`, `oncallEvents` tables
- `ONCALL_SHIFT_STATES`, `ONCALL_SWAP_STATES` constants
- trigger `oncall_event_append_only` (blocks direct UPDATE/DELETE)
- `oncallEvents.clientUuid` unique for idempotent confirm/decline replays

## Task

1. Declare the four tables of `specs/04-oncall.md` §4a.2–§4a.5 in `schema.ts`
   with the columns, foreign keys, checks and indexes named there:
   `oncall_pools` (unique lower-case name, optional `group_id`), `oncall_shifts`
   (unique `(pool_id, starts_at)`, range index, state check), `oncall_swap_requests`
   (partial unique `PENDING` per shift, state check) and `oncall_events`
   (nullable unique `client_uuid`).
2. Add `oncall_event_append_only` with the `BEFORE UPDATE`/direct `DELETE` rule
   of `ticket_events`; the `ON DELETE CASCADE` of a shift must still pass.
3. Generate migration `0020_oncall_tables` with `npm run db:generate` inside
   `apps/api` so the snapshot chain stays complete (WP-M2-67 rule).
4. Add an integration test: duplicate active pool name, duplicate shift start,
   two `PENDING` swaps for one shift, the append-only trigger, the cascade of a
   shift's events, and two events with the same `client_uuid`.

## Non-goals

- No service, route, UI, seed or settings row.
- No backfill and no change to the existing ticket or user tables.
- No notification table.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration test runs against PostgreSQL or skips with
a named reason. The append-only trigger is proven by a rejected `UPDATE` and a
rejected direct `DELETE`.

## Handoff

- Files changed: schema, generated migration and snapshot, integration test
- Interfaces added: the four tables, the state constants, the trigger
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M8-03 (slot calculation) and WP-M8-04 (pool API)
- Open question: none
