# WP-M14-62: The stage set is replaced as one validated chain

format: small-model
status: planned
depends-on: WP-M14-60, WP-M14-61
phase: 14
context-budget: 20k tokens
spec: specs/07-escalation.md §7.9, §7.11; PLAN.md §18
spec-lines: 110

files-read:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/routes.ts
- apps/api/src/tickets/workflow.ts (the transition map)
- packages/shared/src/schemas/escalation-config.ts (`validateEscalationStageChain`)
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/tickets/workflow.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts

interfaces:

- `writeEscalationStages(database, body)` — replaces the whole stage set in one transaction
- `readEscalationStages(database)` — answers `predecessor` and `reachedBy` with every stage
- `TRANSITIONS` of `workflow.ts` exports the event keys the chain may use

## Task

1. `workflow.ts`: export `TRANSITION_EVENT_KEYS` (the distinct event keys of the
   transition map, derived from it, no second list).
2. `readEscalationStages` answers `predecessor` and `reachedBy` of every stage row
   ordered by `position`.
3. `writeEscalationStages`: parse with `escalationStagesBodySchema`, validate the
   chain with `validateEscalationStageChain(stages, TRANSITION_EVENT_KEYS)`; a
   non-empty result throws `EscalationConfigError(400, 'invalid_request', { fields })`
   and writes nothing. In one transaction: delete the stage rows, insert the
   submitted rows (a new key creates, a missing key deletes and cascades to its
   rules), so `PUT` is a replace-all.
4. The rule write keeps its guard: a rule whose `stageKey` names no existing stage
   is rejected with the field path.
5. Extend the config-routes spec: a body that adds an intermediate stage between
   `assignment` and `acceptance` and re-points `acceptance` answers the new set;
   a body without `acknowledgement` answers the remaining set and the rules of
   that stage are gone while their firing rows survive; a body with an unknown
   predecessor answers `400 invalid_request` with `stages.<index>.predecessor`.

## Non-goals

- No change of `routes.ts` paths and permissions.
- No engine change (WP-M14-63), no ticket-view change (WP-M14-64).
- No UI change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the replace-all and the chain guard pass on a throwaway
database, the `404` of the removed manual escalation routes stays unchanged.

## Handoff

- Files changed: (filled by the implementing run)
- Interfaces added: (filled by the implementing run)
- Verified: (filled by the implementing run)
- Follow-up WP: WP-M14-63 (the engine reads the chain)
- Open question: none
