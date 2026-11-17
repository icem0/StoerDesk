# WP-M14-116: the shared contract knows the stage NEW

format: small-model
status: done
depends-on: WP-M14-115
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.1, §7.2, §7.11
spec-lines: 30

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts
- apps/api/src/escalation/__tests__/stage-chain-exit.integration.spec.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts

interfaces:

- the default chain starts with the stage `new` (`Neu` / `New`) — the arrival
  of the ticket; it has no reaching event and hands its clock down
- the stage `review` follows it and keeps its milestone and its rule
- the default rules carry `new#1` for the stage `new`

## Task

1. Add the stage `new` (`Neu` / `New`) to the default chain as its first
   stage: no predecessor and no reaching event, so the workflow never reaches
   it — it is the arrival of the ticket. The stage `review` becomes its
   successor; the other stages keep their milestone, their predecessor and
   their reaching events, the positions follow the chain.
2. Add the rule `new#1` to the default rules: the stage `new`, the reference
   `received_at` and the minutes of ADR-0008.
3. Prove the chain and the rules in the test of the shared contract.
4. Let the stage chain criterion name the first stage of the chain instead of
   `review`, and the escalation scan name the first stage rule and count the
   escalation events per rule.

## Non-goals

- No change of the milestones, the clock and the minutes of the other stages.
- No migration and no seed — an installed chain follows in WP-M14-117.
- No change of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the shared contract and the API suites pass.

## Handoff

- Files changed: the shared contract, its test, the stage chain criterion, the
  escalation scan suite and the repository bookkeeping
- Interfaces added: the stage `new` and the rule `new#1` of the defaults
- Verified: the API suite 896/896, the shared suite, the web suite
- Follow-up WP: WP-M14-117 (the migration adds the stage NEW)
- Open question: none
