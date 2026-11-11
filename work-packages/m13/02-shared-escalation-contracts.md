# WP-M13-02: Shared contracts of the escalation configuration

format: small-model
status: done
depends-on: WP-M13-01
phase: 13
milestone: m13
context-budget: 22k tokens
spec: specs/07-escalation.md §7.1, §7.3, §7.4, §7.5
spec-lines: 120

files-read:

- specs/07-escalation.md §7.1–§7.5
- packages/shared/src/schemas/escalation-stages.ts (the contract it replaces)
- packages/shared/src/timeline.ts (priority and timeline helpers)
- packages/shared/src/schemas/index.ts, packages/shared/src/index.ts
- packages/shared/src/__tests__/escalation.test.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/schemas/index.ts
- packages/shared/src/__tests__/escalation-config.test.ts
- docs/DECISIONS/0017-workflow-stages-as-escalation-stages.md (the mapping of the rules, corrected)

interfaces:

- `ESCALATION_STAGE_KEYS`, `EscalationStageKey`, `DEFAULT_WORKFLOW_ESCALATION_STAGES`
- `escalationConfigSchema`, `EscalationConfig`, `EscalationRuleConfig`, `EscalationActionConfig`
- `escalationConditionSchema`, `EscalationCondition`, `evaluateEscalationCondition(condition, facts)`
- `ESCALATION_REFERENCE_EVENTS`, `DEFAULT_WORKFLOW_ESCALATION_RULES` (the seed of §7.2)

## Task

1. Add the stage contract: the five fixed keys with their names (`de`, `en`), the
   position and the reference of the clock; no free stage key is valid.
2. Add the rule and action contracts: `key`, `stageKey`, `reference`, `minutes`
   per priority, `percent`, `condition`, `actions` with `type`, `config` and
   `condition`.
3. Add the condition contract as a discriminated union (`all`, `any`, leaf) with
   the closed field list of §7.4 and the pure evaluation function
   `evaluateEscalationCondition(condition, facts)`.
4. Add the defaults of §7.2 as `DEFAULT_WORKFLOW_ESCALATION_RULES` (the seed of
   the migration) and the unit tests for the validation and the evaluation.

## Non-goals

- No database, no route, no UI.
- No expression language and no new condition field.
- No change to the timeline helpers.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- packages/shared/src/__tests__/escalation-config.test.ts
npm run wp:check
```

Expected: all green; the unit test covers the stage keys, the condition
evaluation (all, any, leaf, every field and operator) and the invalid bodies.

## Handoff

- Files changed: the shared contract, the barrel export, the unit test, the
  corrected sentence of ADR-0017
- Interfaces added: the exports above
- Verified: typecheck, the shared unit test
- Follow-up WP: WP-M13-03 — the database tables
- Open question: none
