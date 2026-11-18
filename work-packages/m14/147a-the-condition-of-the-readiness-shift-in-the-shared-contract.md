# WP-M14-147a: the condition of the readiness shift in the shared contract

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.4; docs/DECISIONS/0030-the-readiness-shift-is-a-condition-of-the-escalation.md
spec-lines: 45

depends-on: WP-M14-147

files-read:

- packages/shared/src/schemas/escalation-config.ts (the leaves, the facts, the evaluation)
- packages/shared/src/**tests**/escalation-config.test.ts (the tests of the conditions)
- packages/shared/src/escalation.ts (the helpers of the conditions)

files-write:

- packages/shared/src/schemas/escalation-config.ts

interfaces:

- the leaf `shift` — `z.literal('shift')`, the operators `eq` and `ne`, the
  value the uuid of a readiness pool
- `EscalationFacts.staffedPools` — the pools that are staffed at the moment of
  the evaluation; `[]` without the fact
- `evaluateEscalationCondition` — the leaf `shift` matches a pool of
  `staffedPools`

## Task

1. `packages/shared/src/schemas/escalation-config.ts`: the union of the leaves
   gains the leaf `shift` — the operators `eq` and `ne`, the value a uuid. The
   leaf sits at the end of the union, so the order of the fields in the
   administration stays stable.
2. The same file: the type `EscalationFacts` gains the optional fact
   `staffedPools?: readonly string[]`. The fact is optional, because the
   evaluation of a condition without a readiness field must not change.
3. The same file: the evaluator answers the leaf `shift` — `eq` matches a pool
   of `staffedPools`, `ne` a pool that is not in it. Without the fact the leaf
   never matches (`eq` false, `ne` false), so a missing readiness never lets a
   rule fire that asks for a staffed pool.
4. The test file `packages/shared/src/__tests__/escalation-config.test.ts` gains
   the cases: a staffed pool matches, an unstaffed pool does not, `ne` is the
   opposite, a pool without the fact never matches.

## Non-goals

- No API and no database: the engine collects the fact (WP-M14-147b).
- No UI: the builder offers the pool (WP-M14-147d).
- No change of the other leaves and of the depth and the leaf limit of §7.4.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `packages/shared/src/schemas/escalation-config.ts`,
  `packages/shared/src/__tests__/escalation-config.test.ts`, this document,
  `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: the leaf `shift`, the fact `staffedPools`
- Verified: `npm run check`
- Follow-up WP: WP-M14-147b
- Open question: none
