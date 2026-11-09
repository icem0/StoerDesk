# WP-M9-27: ticket_purges is an append-only log again

format: small-model
status: done
depends-on: WP-M9-26
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §15 (audit — append-only protection by a database trigger); PLAN.md §7 rule 10 (permanent deletion); specs/02-data-model.md §4.x (`ticket_purges`)
spec-lines: 30

files-read:

- apps/api/src/db/migrations/0004_ticket_tables.sql (`ticket_events_append_only` trigger pattern)
- apps/api/src/db/migrations/0017_fix_ticket_event_delete_trigger.sql (FK cascade + `pg_trigger_depth` rule)
- apps/api/src/db/migrations/0021_ticket_purges_repair.sql (the table and its FKs)
- apps/api/src/db/schema.ts (`ticketPurges`, `actor_user_id` FK `onDelete: set null`)
- apps/api/src/db/__tests__/migrations.spec.ts (journal and trigger assertions)
- apps/api/src/tickets/delete.ts (the purge insert: API already caps `reason` at 1000)

files-write:

- apps/api/src/db/migrations/0024_ticket_purges_append_only.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts
- apps/api/src/db/__tests__/migrations.spec.ts

interfaces:

- DB trigger `ticket_purges_is_append_only` — `UPDATE`/`DELETE` on `ticket_purges` raise `ticket_purges_append_only` (SQLSTATE `P0001`); the only allowed `UPDATE` is the FK `set null` cascade of a deleted user (only `actor_user_id` may change)
- DB trigger `ticket_purges_reason_length` — an insert with `reason` longer than 1000 characters raises `ticket_purges_reason_too_long` (SQLSTATE `23514`); the reason text never goes into the exception message

## Task

1. `0024_ticket_purges_append_only.sql` (new migration, journal entry added): a
   `BEFORE UPDATE OR DELETE` trigger on `ticket_purges`. A direct `UPDATE` or any
   `DELETE` raises `ticket_purges_append_only` — like `ticket_events` (0004/0017)
   and `oncall_events` (0020), the deletion record may never be altered. The FK
   cascade that clears `actor_user_id` when a user row is deleted is the only
   allowed update: it is recognized by comparing every other field of `OLD` and
   `NEW` (no `pg_trigger_depth` assumption — FK cascades fire at depth 1, see
   0017). A second `BEFORE INSERT` trigger caps `reason` at 1000 characters
   (`ticket_purges_reason_too_long`) so a raw DB write path cannot store an
   unbounded text; the exception names the code only, the reason text is PII.
2. `db/schema.ts`: the `ticketPurges` comment names the protection (migration
   0024) next to the existing "append-only log" wording.
3. `migrations.spec.ts`: assert the new migration (trigger, exception codes, the
   field-by-field FK-cascade rule) and expect `0024_ticket_purges_append_only`
   as the last journal entry.
4. Run `npm run check` — the migration is applied by the API start (direct
   start) and by the integration databases.

## Non-goals

- No change of the delete path itself (`delete.ts` already caps `reason` at the
  API boundary) and no new error mapping — `P0001`/`23514` surface as
  `ticket_delete_failed` params of WP-M2-77 unchanged.
- No column change of `ticket_purges` (adding a table `CHECK` to an existing
  column would need a full-table rewrite — the INSERT trigger enforces it for
  every new row, which is what an append-only log needs).

## Acceptance

```bash
npm run check
```

Expected: green (the integration tests apply migration 0024 against the throwaway
database; `migrations.spec.ts` proves the trigger text and the journal order).

## Handoff

- Files changed: the new migration, the journal, `db/schema.ts`, the migration spec, this WP document
- Interfaces added: `ticket_purges_is_append_only` + `ticket_purges_reason_length` (DB triggers)
- Verified: `npm run check`
- Follow-up WP: WP-M9-28 (shared LIKE escaping for both searches, SEC-012) — the audit closure chain continues package by package, each next WP file is created in the commit that implements its predecessor
- Open question: none
