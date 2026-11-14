# WP-M14-64: The available stages of the ticket view come from the chain

format: small-model
status: planned
depends-on: WP-M14-59, WP-M14-60, WP-M14-62, WP-M14-63
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.10, §7.11
spec-lines: 110

files-read:

- apps/api/src/escalation/config.ts
- apps/api/src/tickets/workflow.ts (`TRANSITIONS`, `TRANSITION_EVENT_KEYS`)
- apps/api/src/tickets/detail.ts (`availableStages`)
- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts

interfaces:

- `readReachableStages(database, status)` — the stages whose `reached_by` meets an event the transition map allows from that status

## Task

1. `readReachableStages` reads the stage rows and answers those stages whose
   `reached_by` contains an event that `TRANSITIONS[status]` (plus the `*` row)
   allows; the `events` of the answer are that intersection, so the ticket view
   still performs a legal workflow transition.
2. Delete the fixed maps `ESCALATION_REACHABLE_STAGES` and
   `ESCALATION_STAGE_EVENTS`; this removes the last use of
   `ESCALATION_STAGE_KEYS` in the API.
3. The detail route contract stays `availableStages: [{ key, names, events }]`;
   `detail.ts` does not change.
4. Extend the stage spec: the default chain answers the same stages per status as
   before (`NEW` → `review`, `WORK_ORDER_CREATED` → `assignment`,
   `ACKNOWLEDGED`/`CLOSED`/`CANCELLED` → none); a chain whose stage `assignment`
   also lists `claimed` answers it for `OFFERED` as well; a stage with an empty
   `reached_by` is never offered.

## Non-goals

- No UI change, no new route.
- No change of the transition map itself (WP-M14-38 owns that).
- No escalation engine change (WP-M14-63 already did it).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the phase-13 stage-selection tests keep passing unchanged.

## Handoff

- Files changed: (filled by the implementing run)
- Interfaces added: (filled by the implementing run)
- Verified: (filled by the implementing run)
- Follow-up WP: WP-M14-65 (the administration adds and removes stages)
- Open question: none
