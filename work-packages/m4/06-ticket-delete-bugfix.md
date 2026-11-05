format: small-model
status: planned
depends-on: WP-M2-77
phase: 4
context-budget: 18k tokens
spec: PLAN.md §7 rule 10
spec-lines: 25

files-read:

- apps/api/src/tickets/delete.ts
- apps/api/src/tickets/delete-routes.ts
- apps/api/src/db/migrations/0004_ticket_tables.sql
- apps/api/src/db/schema.ts
- apps/api/src/index.ts

files-write:

- work-packages/m4/06-ticket-delete-bugfix.md (this file)
- apps/api/src/db/migrations/0017_fix_ticket_event_delete_trigger.sql (new)
- apps/api/src/tickets/delete.ts
- apps/api/src/index.ts

interfaces:

- `deleteTicket()` sets `SET LOCAL stoerdesk.allow_ticket_event_delete = 'true'` inside its transaction so the append-only trigger on `ticket_events` permits the cascade delete of event rows when a cancelled ticket is hard-deleted.
- `ticket_events_append_only()` trigger function accepts a `current_setting('stoerdesk.allow_ticket_event_delete', true) = 'true'` bypass in addition to `pg_trigger_depth() > 1`.
- Fastify error handler always answers `{ code, params }`, even for raw errors without `statusCode`/`code`.

## Task

Hard-delete of a cancelled ticket (`DELETE /api/v1/tickets/:ticketNo`, WP-M2-77/78) fails with a server error because the append-only trigger on `ticket_events` blocks the `ON DELETE CASCADE` of the ticket row.

Root cause: migration 0004's `ticket_events_append_only` trigger uses `pg_trigger_depth() > 1` to distinguish a direct `DELETE` on `ticket_events` (blocked) from a cascade delete triggered by hard-deleting the ticket (allowed). FK cascade actions do **not** increment `pg_trigger_depth()`, so the depth is 1 during the cascade — not > 1 — and the trigger raises `ticket_event_append_only`, aborting the transaction. The raw PostgreSQL error has no `code`/`statusCode`, Fastify's error handler sends it unenveloped, and the client shows the generic German message "Die Meldung konnte nicht gelöscht werden."

1. `apps/api/src/db/migrations/0017_fix_ticket_event_delete_trigger.sql`: replace `CREATE OR REPLACE FUNCTION ticket_events_append_only()` so it also allows deletes when `current_setting('stoerdesk.allow_ticket_event_delete', true) = 'true'`. Keep the `pg_trigger_depth() > 1` exception as a fallback.
2. `apps/api/src/tickets/delete.ts`: inside `database.transaction()`, run `SET LOCAL stoerdesk.allow_ticket_event_delete = 'true'` before the `tx.delete(tickets)` so the cascade delete of `ticket_events` is permitted. `SET LOCAL` scopes the setting to the transaction.
3. `apps/api/src/index.ts`: in `app.setErrorHandler`, when `envelope.code === undefined`, answer `500 { code: 'internal_error', params: {} }` instead of `reply.send(error)`, so every API error carries a `code` the client can display instead of a raw error body.

## Non-goals

- No UI change.
- No change to the `ticket.delete` permission or role matrix.
- No soft-delete or restore.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green.

## Handoff

- Files changed: `apps/api/src/db/migrations/0017_fix_ticket_event_delete_trigger.sql` (new), `apps/api/src/tickets/delete.ts`, `apps/api/src/index.ts`
- Interfaces added: session-variable bypass for the append-only trigger; unenveloped errors now return `{ code, params }`
- Verified: typecheck, lint, vitest, `npm run wp:check`
- Follow-up WP: none
- Open question: none
