# WP-M5-02: the `internal_action_receipts` table (db)

format: small-model
status: done
depends-on: WP-M2-04, WP-M2-67
phase: 5
milestone: m5
context-budget: 12k tokens
spec: PLAN.md §10 ("the server validates replay"), PLAN.md §6 (IDs, timestamps), specs/09-offline.md §9.3
spec-lines: 40

files-read:

- apps/api/src/db/schema.ts — `ticketEvents`, `tickets.client_uuid` unique index style
- apps/api/src/db/migrations/0012_ticket_purges.sql — the current hand-written migration style
- apps/api/src/db/migrations/meta/_journal.json — the snapshot chain of WP-M2-67
- apps/api/src/db/__tests__/migrations.spec.ts — the journal/snapshot guard test

files-write:

- apps/api/src/db/schema.ts — the `internal_action_receipts` table
- apps/api/src/db/migrations/0013_internal_action_receipts.sql — migration 0013
- apps/api/src/db/migrations/meta/0013_snapshot.json — closing snapshot
- apps/api/src/db/__tests__/internalActionReceipts.integration.spec.ts — table test

interfaces:

- table `internal_action_receipts`: `id` uuid pk (uuid v7 default), `client_uuid`
  text not null **unique**, `ticket_id` uuid not null → `tickets` (cascade),
  `actor_user_id` uuid → `users` (set null), `action` text not null,
  `event_id` uuid not null → `ticket_events` (cascade), `created_at` timestamptz
  not null default now()
- `type InternalActionReceipt = typeof internalActionReceipts.$inferSelect`

## Task

Replayed internal writes must not double-execute and must be attributable; the
receipts table is the server-side twin of the outbox `client_uuid` (WP-M5-01).

1. Add `internalActionReceipts` to `apps/api/src/db/schema.ts` with the columns
   above and a `client_uuid` unique index; mirror the naming, `uuidDefault` and
   timestamp options of `ticketEvents`.
2. Write migration `0013_internal_action_receipts.sql` by hand in the style of
   `0012_ticket_purges.sql` (create table, the two foreign keys, the unique
   index).
3. Extend the journal with entry 0013 and keep the snapshot chain of WP-M2-67
   intact: `0013_snapshot.json` gets `prevId` of `0012`, the chain links and the
   guard test of `migrations.spec.ts` stay green.
4. Integration spec: insert one receipt, assert the unique violation on a second
   insert with the same `client_uuid` and the cascade delete with the ticket.

## Non-goals

- No route, no service helper — WP-M5-03 and WP-M5-04.
- No change to `ticket_events` or the workflow transition map.
- No web change; the client outbox already exists (WP-M5-01).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/api
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the integration spec runs in CI against the throwaway
database and skips locally without PostgreSQL (reported as unverified locally).

## Handoff

- Files changed: `apps/api/src/db/schema.ts`, `apps/api/src/db/migrations/0013_internal_action_receipts.sql`, `apps/api/src/db/migrations/meta/_journal.json`, `apps/api/src/db/migrations/meta/0013_snapshot.json`, `apps/api/src/db/__tests__/internalActionReceipts.integration.spec.ts`, `apps/api/src/db/__tests__/migrations.spec.ts`
- Interfaces added: `internalActionReceipts` table (`id`, `client_uuid` unique, `ticket_id` → tickets cascade, `actor_user_id` → users set null, `action`, `event_id` → ticket_events cascade, `created_at`), types `InternalActionReceipt` / `NewInternalActionReceipt`
- Verified: `npm run typecheck -w @stoerdesk/api`, `npm run lint`, `npm run test:run` (integration spec skips without PostgreSQL), `npm run wp:check`
- Follow-up WP: WP-M5-03 (`m5/03-idempotent-transition-helper.md`)
- Open question: none
