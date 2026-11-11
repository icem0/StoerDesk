# WP-M13-08: The reachable stages of a ticket

format: small-model
status: planned
depends-on: WP-M13-04
phase: 13
milestone: m13
context-budget: 20k tokens
spec: specs/07-escalation.md §7.1, §7.10
spec-lines: 70

files-read:

- specs/07-escalation.md §7.1, §7.10
- apps/api/src/tickets/workflow.ts (the transition map)
- apps/api/src/tickets/detail.ts (the ticket answer)
- packages/shared/src/schemas/ticket.ts (the detail contract)
- apps/api/src/tickets/workflow-routes.ts (the routes of the transitions)

files-write:

- apps/api/src/tickets/detail.ts
- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts

interfaces:

- the ticket detail answers `availableStages: [{ key, name, variants: [{ event }] }]`
- `GET /api/v1/escalation-stages` answers the five stages with their names

## Task

1. Answer the stages a ticket can still reach: the transition map of
   `apps/api/src/tickets/workflow.ts` is the single source, the answer carries
   the stage key, its name and the events of its variants (the stage
   `assignment` has the variants `assigned` and `offered`).
2. Add the field to the shared ticket contract and to the detail answer.
3. Move the staff read of the stages to the new table: `GET
   /api/v1/escalation-stages` answers the five stages with their names.
4. Add the integration test: the answer of a `NEW` ticket offers the stage
   `review`, an `OFFERED` ticket offers `acceptance`, an acknowledged ticket
   offers nothing.

## Non-goals

- No UI in this package (WP-M13-09).
- No change to the transition map itself.
- No new route for the stages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/tickets/__tests__/detail-stages.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves the reachable stages per status and the
staff read of the stage names.

## Handoff

- Files changed: the detail service, the shared contract, the integration test
- Interfaces added: `availableStages` and the stage read
- Verified: typecheck, the integration test
- Follow-up WP: WP-M13-09 — the stage selection in the ticket view
- Open question: none
