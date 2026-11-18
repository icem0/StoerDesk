# WP-M14-150c: the claim and the acceptance name the technician

format: small-model
status: planned
depends-on: WP-M14-150a
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.14; specs/02-data-model.md §4.13
spec-lines: 30

files-read:

- apps/api/src/tickets/workflow.ts (the steps of the workflow)
- apps/api/src/db/schema.ts (`ticketAssignees`)
- apps/api/src/tickets/**tests**/workflow-columns.integration.spec.ts (the test)
- specs/02-data-model.md (§4.13 `ticket_assignees`)

files-write:

- apps/api/src/tickets/workflow.ts
- apps/api/src/tickets/**tests**/workflow-columns.integration.spec.ts

interfaces:

- the `claimed` and the `accepted` step of a user writes a row of
  `ticket_assignees`

## Task

1. `transitionTicket()` writes the row of `ticket_assignees` when a **user**
   performs the `claimed` or the `accepted` step: the technician who took the
   ticket himself is an assignee of the ticket (§4.13). The row is written in
   the same transaction as the step.
2. A system action writes no row — the escalation writes its own rows
   (ADR-0026), and a decline leaves the rows of the ticket untouched.
3. Prove the row of the claim and of the acceptance in the test of the workflow
   columns.

## Non-goals

- No change of the workflow: the steps and their guards stay as they are.
- No notification: the message to the assignee is the action of
  WP-M14-150a.
- No change of `tickets.assigned_user_id`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the workflow test proves the row of the technician.

## Handoff

- Files changed: the workflow and its test
- Interfaces added: the assignee row of the claim and of the acceptance
- Verified: —
- Follow-up WP: WP-M14-150d (the administration)
- Open question: none
