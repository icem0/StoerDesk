format: small-model
status: pending
depends-on: WP-M2-78
phase: 2
context-budget: 12k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0002_core_object_tables.sql
- apps/api/src/db/migrations/0004_ticket_tables.sql

files-write:

- apps/api/src/db/migrations/0015_remove_systems_level.sql
- apps/api/src/db/schema.ts

interfaces:

- Migration `0015_remove_systems_level.sql`: drops `tickets.system_id` column and FK, then drops table `systems` and its indexes.
- `schema.ts`: removes `systems` table export, removes `systemId` column from `tickets`, removes `SYSTEM_TYPES`, `System` / `NewSystem` types.

## Task

Remove the second level ("Anlage"/`systems`) from the data model. Tickets reference only the object (`object_id`) from now on.

1. Create migration `0015_remove_systems_level.sql`:
   - `ALTER TABLE tickets DROP CONSTRAINT ...` for the `system_id` FK
   - `ALTER TABLE tickets DROP COLUMN system_id`
   - `DROP TABLE systems` (cascades indexes)
2. In `schema.ts`:
   - Remove the `systems` pgTable definition and its `SYSTEM_TYPES` constant
   - Remove `systemId` from `tickets`
   - Remove `System` / `NewSystem` type exports

## Non-goals

- No data migration of existing `system_id` values (project not yet productive with customer data).
- `external_type` on `objects` stays (it is an object attribute, not a system level).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/db/migrations/0015_remove_systems_level.sql`, `apps/api/src/db/schema.ts`
- Follow-up WP: WP-M2-81 (shared schemas)
- Open question: none
