# WP-M20-03: the API stores the pattern and generates the blocks

format: small-model
status: done
depends-on: WP-M20-02
phase: 20
milestone: m20
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.2, §4a.3.3, §4a.8
spec-lines: 40

files-read:

- apps/api/src/oncall/service.ts (generation and the shift insert)
- apps/api/src/db/schema.ts (`oncallShifts`)
- apps/api/src/oncall/**tests**/window-plan.integration.spec.ts (the plan of the
  pool and the shifts of a week)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- apps/api/src/db/migrations/0059_oncall_shift_pattern.sql
- apps/api/src/db/schema.ts
- apps/api/src/oncall/service.ts
- apps/api/src/oncall/**tests**/block-generation.integration.spec.ts

interfaces:

- migration: `oncall_shifts.weekdays` (text), `daily_start`, `daily_end` (text);
  a row without a pattern keeps covering its whole span
- `generateShifts` emits one shift per block per week when the pool carries
  blocks; the insert stays idempotent on `(pool_id, starts_at)`

## Task

1. Migration adds the three shift columns. A shift without a pattern (the rows
   of the continuous plan and the day windows of an older version) keeps
   covering its whole span; a shift of a block carries its pattern. The
   columns stay empty for the rows of an older version — a default that
   describes a one-day block cannot be right for the continuous plan of
   ADR-0011, whose shift covers seven days.
2. `generateShifts` emits blocks: the plan of the pool is read with
   `resolveOncallBlocks`, a stored day window reads as a block of one day.
3. The shift rows of a block carry the pattern (the covered weekdays with the
   daily window).
4. Integration test: a pool with the office blocks generates two shifts for a
   week with their spans and patterns; a day shift of an older version stays a
   day shift.

## Non-goals

- No change of the pool route — the pool carries its blocks in WP-M20-04.
- No change of the coupling and the iCal feed (WP-M20-06, WP-M20-07).
- No deletion of existing shifts.

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

- Files changed: the migration, `schema.ts`, `service.ts`, the new test
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M20-04
- Open question: none
