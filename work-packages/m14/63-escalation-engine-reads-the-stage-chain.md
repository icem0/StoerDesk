# WP-M14-63: The escalation engine reads the stage chain

format: small-model
status: planned
depends-on: WP-M14-59, WP-M14-60, WP-M14-62
phase: 14
context-budget: 24k tokens
spec: specs/07-escalation.md §7.2, §7.3, §7.7, §7.11
spec-lines: 140

files-read:

- apps/api/src/tickets/escalation.ts
- apps/api/src/db/schema.ts (`escalationStages`)
- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts

files-write:

- apps/api/src/tickets/escalation.ts
- apps/api/src/tickets/__tests__/escalation.integration.spec.ts
- apps/api/src/escalation/__tests__/actions.integration.spec.ts

interfaces:

- `reachedStages(events, stages)` — the keys of the stages that carry an event of their `reached_by`
- `stageReferenceTime(ticket, events, stages, stageKey)` — the clock start of a stage: `received_at` without predecessor, else the latest event of the predecessor

## Task

1. Read the active stage rows once per scan (`key`, `predecessor`, `reachedBy`).
2. Replace the hard-coded `STAGE_EVENTS` map: a stage is reached when one event
   of its `reachedBy` exists in the events of the ticket. The facts
   `stageReached` use that derivation.
3. Replace the status gate `WAITING_STATUS_BY_REFERENCE` for stage rules: the
   clock of a stage rule starts at `stageReferenceTime` (`received_at` for a stage
   without predecessor), and the rule fires only while its stage is **not reached**
   and the elapsed time minus the pauses passed `minutes[priority]`.
4. Deadline rules (`percent`) keep their timeline clock and their stage-free
   gate; a rule whose `reference` contradicts the clock of its stage cannot exist,
   because WP-M14-60 rejects it.
5. Extend the integration specs: the default chain still fires `review` and the
   acknowledgement rule once per threshold; a seeded chain with an added
   intermediate stage fires the intermediate rule after its predecessor was
   reached and not after the following stage was reached; a stage with an empty
   `reachedBy` never counts as reached.

## Non-goals

- No route, UI or i18n change.
- No change of `escalation_firings` and no new action type.
- No change of the on-call offer timeout in the scan.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the firing counts of the phase-13 exit test stay identical
for the default chain, the intermediate stage fires exactly once.

## Handoff

- Files changed: (filled by the implementing run)
- Interfaces added: (filled by the implementing run)
- Verified: (filled by the implementing run)
- Follow-up WP: WP-M14-64 (the available stages of the ticket view)
- Open question: none
