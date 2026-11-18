# WP-M14-134a: the table of the priority deviations

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 25

depends-on: WP-M14-134

files-read:

- apps/api/src/db/schema.ts (the tables and their checks)
- apps/api/src/db/migrations/0049_channel_health_warning.sql (the style of a hand-written migration)
- apps/api/src/db/migrations/meta/_journal.json (the journal of the migrations)
- packages/shared/src/timeline.ts (the four priorities)

files-write:

- apps/api/src/db/migrations/0050_object_priority_overrides.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/schema.ts

interfaces:

- `objectPriorityOverrides` — the drizzle table: `objectId` (uuid, primary key,
  foreign key to `objects` with `ON DELETE CASCADE`), `priority` (text, not
  null), `createdAt`, `updatedAt`
- The check `object_priority_overrides_priority_check` over `low`, `normal`,
  `high`, `critical`

## Task

1. Write `apps/api/src/db/migrations/0050_object_priority_overrides.sql`: the
   table `object_priority_overrides` with the columns of
   `specs/02-data-model.md` §4.3.2 — `object_id` uuid primary key with the
   foreign key to `objects(id)` and `ON DELETE CASCADE`, `priority` text not
   null with the check over the four priorities, `created_at` and `updated_at`
   timestamptz with the default `now()`. The comment of the file names the
   ADR and the rule of the table: it holds only the deviations from the
   standard.
2. Add the entry `0050_object_priority_overrides` to
   `apps/api/src/db/migrations/meta/_journal.json` (idx 50, the timestamp of
   the day).
3. Add the table `objectPriorityOverrides` to `apps/api/src/db/schema.ts`
   next to `objects`, with the check of the priorities and the cascade of the
   foreign key.
4. Add an integration test that creates an object, writes a deviation for it and
   proves that the row is gone when the object is deleted.

## Non-goals

- No priority column on `objects` (ADR-0029, decision 2).
- No read or write of the deviation — that is WP-M14-134c.
- No `contracts_refs` table.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the migration applies and the table holds one row per
object that deviates.

## Handoff

- Files changed: the migration, the journal, the schema of the API
- Interfaces added: `objectPriorityOverrides`
- Verified: `npm run check` (exit 0), the integration spec of the table
- Follow-up WP: WP-M14-134b (the contracts of the priority and of the standard)
- Open question: none
