# WP-M14-60: The shared contracts of the escalation stage chain

format: small-model
status: done
depends-on: WP-M14-58
phase: 14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.3, §7.9, §7.11
spec-lines: 120

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts
- apps/api/src/escalation/config.ts (the current stage-body cap)
- specs/07-escalation.md §7.11

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation-config.test.ts

interfaces:

- `EscalationStageConfig { key, names, position, active, predecessor: string | null, reachedBy: string[] }`
- `validateEscalationStageChain(stages, eventKeys): string[]` — the violated field paths
- `escalationStagesBodySchema` — the body of `PUT /api/v1/escalation/stages`, at most 20 stages

## Task

1. `escalationStageConfigSchema`: `key` is `z.string().regex(keyPattern)` instead of
   `z.enum(ESCALATION_STAGE_KEYS)`; add `predecessor` (nullable key pattern) and
   `reachedBy` (array of event keys, max. 6, default `[]`). Keep
   `EscalationStageKey` as a string alias and rename the comment of
   `ESCALATION_STAGE_KEYS` to "the keys of the default chain of §7.1" — it stays a
   seed default, never a validation.
2. Export `validateEscalationStageChain(stages, eventKeys)`: a pure function that
   returns the field paths of every violation — duplicate key, unknown or
   self-referencing predecessor, cycle, a position that is not greater than the
   position of the predecessor, an unknown `reachedBy` event key.
3. `escalationStagesBodySchema` and `escalationConfigSchema` accept at most 20
   stages (no fixed count any more) and `escalationRuleConfigSchema.stageKey`
   becomes a nullable free key; the clock rule of §7.11 is asserted in the
   `superRefine` of the rule: a rule of a stage whose `reference` contradicts the
   clock of its stage is rejected.
4. `DEFAULT_WORKFLOW_ESCALATION_STAGES` carries the chain of §7.1:
   `predecessor` and `reachedBy` per stage.
5. Extend the shared test: the default chain validates, a chain with an
   intermediate stage (`assignment` → `night_shift` → `acceptance`) validates, an
   unknown predecessor, a cycle and a contradictory position each return their
   field path.

## Non-goals

- No database, service, route, UI or i18n change.
- No change of the condition fields and of the actions.
- No removal of `ESCALATION_STAGE_KEYS` (its last use leaves with WP-M14-64).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec of the chain validation fails before the change
and passes after it.

## Handoff

- Files changed: `packages/shared/src/schemas/escalation-config.ts`, `packages/shared/src/__tests__/escalation-config.test.ts`
- Interfaces added: `predecessor`/`reachedBy` on `EscalationStageConfig`, `escalationStagesBodySchema`, `validateEscalationStageChain(stages, eventKeys)`; free stage keys in rules and `stageReached`
- Verified: `npm run typecheck -w @stoerdesk/shared`, the shared escalation test suite (20 tests) and ESLint
- Follow-up WP: WP-M14-61 (the seed of the chain)
- Open question: none
