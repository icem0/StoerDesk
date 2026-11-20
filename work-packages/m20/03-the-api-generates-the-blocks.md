# WP-M20-03: the API stores the pattern and generates the blocks

format: small-model
status: planned
depends-on: WP-M20-02
phase: 20
milestone: m20
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.2, §4a.3.3, §4a.8
spec-lines: 40

files-read:

- apps/api/src/oncall/service.ts (generation and the shift insert)
- apps/api/src/oncall/pools.ts (the pool windows)
- apps/api/src/db/schema.ts (`oncallShifts`)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- apps/api/src/db/migrations/ (one migration: `oncall_shifts` pattern columns)
- apps/api/src/db/schema.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/pools.ts

interfaces:

- migration: `oncall_shifts.weekdays` (text), `daily_start`, `daily_end` (text),
  defaults describing a one-day block; `oncall_pools.weekly_windows` keeps its column
- `generateShifts` uses `generateOncallBlockSlots` when the pool has blocks
- `PATCH /api/v1/oncall/pools/:id` accepts `weeklyWindows` as blocks

## Task

1. Migration adds the three shift columns with defaults that describe a one-day
   block, so existing rows stay valid. Update `schema.ts`.
2. `generateShifts` emits blocks; the insert stays idempotent on
   `(pool_id, starts_at)`.
3. The pool route validates blocks with the WP-M20-02 schema and refuses
   `to_weekday` before `from_weekday` with `400 invalid_request`.
4. Integration test: the office blocks generate two shifts for a week with
   their spans and patterns; an existing day shift is untouched.

## Non-goals

- No change of the coupling and the iCal feed (WP-M20-04).
- No form (WP-M20-05). No deletion of existing shifts.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green with a reachable Postgres; the new test fails before the
change.

## Handoff

- Files changed: the migration, `schema.ts`, `service.ts`, `pools.ts`
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M20-04
- Open question: none
