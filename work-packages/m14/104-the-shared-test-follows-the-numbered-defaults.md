# WP-M14-104: the shared test follows the numbered defaults

format: small-model
status: done
depends-on: WP-M14-103
phase: 14
milestone: m14
context-budget: 8k tokens
spec: specs/07-escalation.md §7.2, §7.5
spec-lines: 8

files-read:

- packages/shared/src/__tests__/escalation-config.test.ts

files-write:

- packages/shared/src/__tests__/escalation-config.test.ts

interfaces:

- the test of the defaults names the numbered keys and finds a rule by its
  stage and its reference

## Task

1. Name the numbered keys of the defaults in the shared test.
2. Find the rule of the review stage, the offer rule and the assignment rule by
   their stage and their reference instead of by their former key.

## Non-goals

- No change of the defaults and of the contract.
- No change of the behaviour.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the shared suite passes (150/150).

## Handoff

- Files changed: the shared test and the repository bookkeeping
- Interfaces added: none — the gate of WP-M14-99 is repaired
- Verified: the shared suite 150/150
- Follow-up WP: none
- Open question: none
