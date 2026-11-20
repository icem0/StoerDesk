# WP-M20-02: the shared blocks and the pattern resolver

format: small-model
status: planned
depends-on: WP-M20-01
phase: 20
milestone: m20
context-budget: 16k tokens
spec: specs/04-oncall.md §4a.3.3
spec-lines: 40

files-read:

- packages/shared/src/oncall.ts (the window resolver and the window generator)
- packages/shared/src/schemas/oncall.ts (the window contracts)
- packages/shared/src/__tests__/oncall.test.ts (the window tests)
- docs/DECISIONS/0040-the-duty-block-carries-a-weekly-pattern.md

files-write:

- packages/shared/src/oncall.ts
- packages/shared/src/schemas/oncall.ts
- packages/shared/src/__tests__/oncall.test.ts

interfaces:

- `OncallBlock` — `{ fromWeekday, toWeekday, start, end }`
- `resolveOncallBlocks(value)` — a stored one-day window reads as a block with
  `from` = `to`; malformed entries and `to` before `from` are dropped
- `generateOncallBlockSlots({ from, to, blocks })` — one slot per block per week,
  span from the first day at `start` to the last day at `end`, with the pattern

## Task

1. Add the block schema: weekdays `0`–`6`, `from` ≤ `to`, `start` < `end`.
2. Add the resolver with the one-day compatibility rule of ADR-0040 decision 3.
3. Add the generator and the pattern helper `isCoveredByPattern(shift, instant)`
   (span, covered weekday, daily window in `Europe/Berlin`).
4. Tests: the office blocks (Mon–Thu, Fri), a 24/7 block, a DST week, a range
   border, the one-day compatibility.

## Non-goals

- No API, no migration, no UI (WP-M20-03 to WP-M20-05).
- No change of `generateOncallSlots` (ADR-0011).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the three shared files above
- Interfaces added: the contracts above
- Verified: the commands above
- Follow-up WP: WP-M20-03
- Open question: none
