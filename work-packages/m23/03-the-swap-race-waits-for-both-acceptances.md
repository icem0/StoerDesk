# WP-M23-03: the swap race waits for both acceptances

format: small-model
status: done
depends-on: WP-M23-01
phase: 23
milestone: m23
context-budget: 12k tokens
spec: specs/04-oncall.md §4a.5
spec-lines: 20

files-read:

- apps/api/src/oncall/swaps.ts (the acceptance of a swap)
- apps/api/src/oncall/__tests__/swaps.integration.spec.ts (the test of the race)
- specs/04-oncall.md §4a.5 (the rules of a swap)

files-write:

- apps/api/src/oncall/__tests__/swaps.integration.spec.ts
- work-packages/README.md, PLAN.md

interfaces:

- `Promise.allSettled` — the test of the race waits for both acceptances, so the
  answer of the winner is written before the assertion reads it

## Task

1. The check run of WP-M23-01 failed in the test „accepts a pending swap
   atomically — exactly one of two concurrent acceptances wins“: the assertion
   `expect(winner).not.toBeNull()` read `null`. The cause is a race of the test
   itself and not of the service: `Promise.all` rejects with the first loser,
   so the `catch` ran and the assertion followed before the winner had written
   its answer.
2. Wait for both acceptances with `Promise.allSettled` and read the winner and
   the loser from the two outcomes. The rule of the test stays: exactly one
   acceptance wins and the loser answers `409` with `swap_taken` or
   `swap_not_pending`.

## Non-goals

- No change of the service `acceptSwap` and no change of the atomic `UPDATE`.
- No change of the other tests of the swaps.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the test of the race passes on every run.

## Handoff

- Files changed: the test of the race
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none
- Open question: none
