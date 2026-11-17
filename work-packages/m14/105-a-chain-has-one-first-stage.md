# WP-M14-105: a chain has one first stage

format: small-model
status: done
depends-on: WP-M14-104
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 12

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

interfaces:

- `escalationFirstStageKey(stages)` names the stage without a predecessor with
  the smallest position
- the chain validator names a second stage without a predecessor

## Task

1. Name the first stage of a chain in the shared contract: the stage without a
   predecessor with the smallest position.
2. Reject a chain with a second stage without a predecessor — the path of the
   second one is `stages.<i>.predecessor`.
3. Prove the helper and the new violation in the shared test.

## Non-goals

- No change of the service and of the administration.
- No change of the chain of the seed.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the shared suite passes (153/153).

## Handoff

- Files changed: the shared contract, its test and the repository bookkeeping
- Interfaces added: the helper of the first stage, the new violation
- Verified: the shared suite 153/153
- Follow-up WP: WP-M14-106 (the service protects only the first stage)
- Open question: none
