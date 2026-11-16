# WP-M14-78: The offered stages come from the transition table

format: small-model
status: done
depends-on: WP-M14-77
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.10 and §7.11, docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md (the consequence)
spec-lines: 40

files-read:

- apps/api/src/escalation/config.ts (`readReachableStages`, `writeEscalationStages`)
- apps/api/src/tickets/transition-service.ts (`readTicketTransitions`)
- apps/api/src/tickets/workflow.ts (`TRANSITIONS`, `TRANSITION_EVENT_KEYS`)
- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts (the reachable stages)
- apps/api/src/db/schema.ts (`ticketTransitions`)

files-write:

- apps/api/src/escalation/config.ts (the two views read the table)
- apps/api/src/tickets/workflow.ts (the removed code map)
- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts (the two new tests)
- docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md (the consequence)

interfaces:

- `readReachableStages(database, status)` — the stages whose `reached_by` meets an
  **active** row of `ticket_transitions` whose `from_status` is the status of the
  ticket
- `PUT /api/v1/escalation/stages` — the `reached_by` of a stage names the event
  keys of the rows of `ticket_transitions`

## Task

1. ADR-0025 named the consequence: the escalation layer still reads the code map
   `TRANSITIONS`, so after an administrator edited the rows of
   `ticket_transitions` the ticket view could offer a stage whose event the
   engine rejects (`409 invalid_transition`). The offered stages come from the
   table now.
2. `apps/api/src/escalation/config.ts`: `readReachableStages()` reads the rows of
   `ticket_transitions` and allows the event keys of the **active** rows whose
   `from_status` is the status of the ticket; `writeEscalationStages()` validates
   the chain against the event keys of the table, so a stage may name every event
   an installation has a step for. The code map is no longer read here.
3. `apps/api/src/tickets/workflow.ts`: `TRANSITIONS` and
   `TRANSITION_EVENT_KEYS` had no reader left — the engine resolves the rows in
   `transition-service.ts` — and are removed, so no second source of truth
   survives.
4. `docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md`: the
   consequence that names the code map describes the new state.

## Non-goals

- No change of the workflow engine, of the transition administration and of the
  stage chain itself.
- No change of the ticket detail route — the shape of `availableStages` stays.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/escalation/config.ts`,
  `apps/api/src/tickets/workflow.ts`,
  `apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts`,
  `docs/DECISIONS/0025-ticket-transitions-as-database-configuration.md`,
  this document, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: none — the two views of the escalation layer read the table
- Verified: `npm run check` green; the two new tests of
  `detail-stages.integration.spec.ts` fail before the change
  (`offers a stage only while its step is active`: the code map offered the stage
  of a deactivated step; `offers a stage that names a step the administration
  added`: the code map knew the new event key not) and pass after it
- Follow-up WP: WP-M14-86 (the acknowledge result of the ticket view is a
  selection, so the enum of the API cannot be mistyped)
- Open question: none
