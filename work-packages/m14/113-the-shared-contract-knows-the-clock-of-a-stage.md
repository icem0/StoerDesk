# WP-M14-113: the shared contract knows the clock of a stage

format: small-model
status: done
depends-on: WP-M14-112
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.11
spec-lines: 12

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

interfaces:

- `escalationStageClockEvents(stageKey, stages)` answers the events that start
  the clock of a stage
- a predecessor that the workflow never reaches hands its clock down

## Task

1. Add `escalationStageClockEvents(stageKey, stages)` to the shared contract:
   the clock of a stage starts with the events that reach its predecessor; a
   predecessor without a reaching event hands its own clock down, so the clock
   of a chain starts at the report.
2. Use the helper in the validation of the configuration: the explicit
   reference of a rule must match the clock of its stage.
3. Prove the helper in the test of the shared contract: the clock of a stage,
   the report for the stage without a predecessor and the inherited clock of a
   predecessor that is never reached.

## Non-goals

- No change of the default chain — it starts with the stage `new` in
  WP-M14-116.
- No change of the engine and of the service — they use the helper in
  WP-M14-114.
- No change of the conditions and of the actions.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the shared contract passes.

## Handoff

- Files changed: the shared contract, its test and the repository bookkeeping
- Interfaces added: `escalationStageClockEvents(stageKey, stages)`
- Verified: the shared contract 157/157, the typecheck of the workspaces
- Follow-up WP: WP-M14-114 (the engine and the service use the helper)
- Open question: none
