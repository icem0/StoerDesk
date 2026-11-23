# WP-M21-02: the shared normalisation of the duty blocks

format: small-model
status: done
depends-on: WP-M21-01
phase: 21
milestone: m21
context-budget: 14k tokens
spec: specs/04-oncall.md §4a.3.4
spec-lines: 30

files-read:

- packages/shared/src/oncall.ts (the block resolver and the week order)
- packages/shared/src/__tests__/oncall.test.ts (the block tests)
- docs/DECISIONS/0044-consecutive-days-form-one-duty-block.md

files-write:

- packages/shared/src/oncall.ts
- packages/shared/src/__tests__/oncall.test.ts

interfaces:

- `mergeOncallBlocks(blocks: OncallBlock[]): OncallBlock[]` — the blocks with
  the same daily window on consecutive weekdays become one block; a plan that
  covers a weekday twice with different windows stays as it is

## Task

1. Add `mergeOncallBlocks` to `packages/shared/src/oncall.ts`: the blocks are
   read in the order of the week of Monday to Sunday, two blocks with the same
   `start` and `end` become one block when the weekdays between them are
   covered by no other block.
2. Keep the covered weekdays and the daily window; the result is sorted by the
   first day of the week.
3. Return the plan unchanged when a weekday is covered twice with different
   daily windows (the contradictory plan of ADR-0044 decision 4).
4. Tests: the office plan of five day windows becomes two blocks, the plan of
   seven days becomes one block, two blocks with different times stay apart, a
   block that is separated by a covered weekday stays as it is, and the
   contradictory plan stays unchanged.

## Non-goals

- No API, no UI (WP-M21-03, WP-M21-04).
- No change of `resolveOncallBlocks`, `generateOncallBlockSlots` and
  `isCoveredByPattern`.
- No change of the stored plan.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the shared module and its test
- Interfaces added: `mergeOncallBlocks`
- Verified: the commands above
- Follow-up WP: WP-M21-03
- Open question: none
