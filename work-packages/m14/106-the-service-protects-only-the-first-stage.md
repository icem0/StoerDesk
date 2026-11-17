# WP-M14-106: the service protects only the first stage

format: small-model
status: done
depends-on: WP-M14-105
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 12

files-read:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts

interfaces:

- `PUT /api/v1/escalation/stages` protects the first stage of the installed
  chain — the stage without a predecessor with the smallest position
- a second stage without a predecessor is rejected by the chain and may be
  removed

## Task

1. Read the whole installed chain and name its first stage with
   `escalationFirstStageKey` instead of protecting every stage without a
   predecessor.
2. Prove in the stage chain test that a second stage without a predecessor is
   rejected and that a stage without a predecessor of an earlier version is
   removed while the first stage stays.

## Non-goals

- No change of the chain validation — WP-M14-105 rejects the second stage.
- No change of the administration.
- No change of the clock of a stage.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the stage chain suite passes (6/6).

## Handoff

- Files changed: the stage writer, the stage chain test and the repository
  bookkeeping
- Interfaces added: none — the protection covers the first stage only
- Verified: the stage chain 6/6
- Follow-up WP: WP-M14-107 (the administration protects the first stage only)
- Open question: none
