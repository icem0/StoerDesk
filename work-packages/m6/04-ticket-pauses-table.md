# WP-M6-04: ticket_pauses table and migration 0014

format: small-model
status: planned
depends-on: WP-M6-02
phase: 6
milestone: m6
context-budget: 16k tokens
spec: specs/05-timeline.md §5.2; specs/02-data-model.md §4.12
spec-lines: 50

files-read:

- specs/05-timeline.md §5.2
- apps/api/src/db/schema.ts (tickets, ticketEvents)
- apps/api/src/db/migrations/0013_internal_action_receipts.sql
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts (test pattern)

files-write:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0014_ticket_pauses.sql (generated)
- apps/api/src/db/migrations/meta/_journal.json (generated)
- apps/api/src/db/migrations/meta/0014_snapshot.json (generated)

interfaces:

- `ticketPauses` table: `id`, `ticketId`, `reason`, `startedAt`, `endedAt`,
  `startedByUserId`, `endedByUserId`, `createdAt`
- partial unique index `ticket_pauses_one_open_per_ticket`

## Task

1. Declare `ticketPauses` in `apps/api/src/db/schema.ts` with the columns and
   foreign keys of the spec (ticket cascade, users set null).
2. Add the partial unique index on `ticket_id WHERE ended_at IS NULL` and an
   index on `ticket_id`.
3. Generate migration `0014_ticket_pauses` with `npm run db:generate` inside
   `apps/api` so the snapshot chain stays complete (WP-M2-67 rule).
4. Add an integration test: two open pauses for one ticket violate the partial
   index; a closed pause allows a new one; deleting the ticket removes its
   pauses.

## Non-goals

- No service, route or UI.
- No data backfill.
- No changes to `tickets`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration test runs against PostgreSQL or skips with a
named reason.

## Handoff

- Files changed: schema, generated migration + snapshot, integration test
- Interfaces added: `ticketPauses`
- Verified: typecheck, lint, test:run
- Follow-up WP: WP-M6-05 (pause service)
- Open question: none
