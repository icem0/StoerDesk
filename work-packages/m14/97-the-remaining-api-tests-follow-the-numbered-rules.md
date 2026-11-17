# WP-M14-97: the remaining API tests follow the numbered rules

format: small-model
status: done
depends-on: WP-M14-96
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/07-escalation.md §7.5, §7.6
spec-lines: 12

files-read:

- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts
- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts
- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts

files-write:

- apps/api/src/escalation/__tests__/phase13-exit.integration.spec.ts
- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts
- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts

interfaces:

- the phase 13 criterion, the deadline exit criterion and the seed test read
  the key of a seeded rule from the shared defaults

## Task

1. Read the key of the seeded rule of the review stage and of the deadline
   rules from `DEFAULT_WORKFLOW_ESCALATION_RULES` in the phase 13 criterion, in
   the deadline exit criterion and in the seed test.
2. Keep the wording of the tests and their expectations unchanged.

## Non-goals

- No change of the contract, of the service or of the seed.
- No change of the behaviour of a test.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the three suites pass (9/9).

## Handoff

- Files changed: the three suites and the repository bookkeeping
- Interfaces added: none
- Verified: the three suites 9/9
- Follow-up WP: WP-M14-98 (the contract knows the numbered keys)
- Open question: none
