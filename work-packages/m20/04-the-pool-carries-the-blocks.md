# WP-M20-04: the pool carries the duty blocks

format: small-model
status: planned
depends-on: WP-M20-03
phase: 20
milestone: m20
context-budget: 20k tokens
spec: specs/04-oncall.md §4a.2, §4a.3.3
spec-lines: 40

files-read:

- apps/api/src/oncall/pools.ts (the pool routes)
- packages/shared/src/schemas/oncall.ts (the pool contract)
- apps/web/src/admin/oncall-page.tsx (the pool windows block of WP-M15-07c)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- packages/shared/src/schemas/oncall.ts
- apps/api/src/oncall/pools.ts
- apps/web/src/admin/oncall-page.tsx
- apps/web/src/admin/**tests**/oncall-page.test.tsx

interfaces:

- `weeklyWindows` of a pool carries the duty blocks
  (`from_weekday`, `to_weekday`, `start`, `end`)
- `PATCH /api/v1/oncall/pools/:id` accepts the blocks and refuses
  `to_weekday` before `from_weekday` with `400 invalid_request`
- the administration shows one row per block: „von – bis“, start and end

## Task

1. The pool contract carries the blocks; the answer of the API normalizes a
   stored day window of an older version to a block of one day.
2. The route validates the blocks with the schema of WP-M20-02 and refuses a
   block whose last weekday lies before its first weekday.
3. The administration replaces the seven weekday rows by the rows of the
   blocks: two weekday selects, start and end — with the texts of the phase.
4. Test: the page writes the blocks of the pool.

## Non-goals

- No new page, no change of the calendar (`/oncall`).
- No preset and no text of its own — WP-M20-05 adds them.
- No migration, no change of the generation (WP-M20-03).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change.

## Handoff

- Files changed: the shared schema, the pool route, the page, the page test
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M20-05
- Open question: none
