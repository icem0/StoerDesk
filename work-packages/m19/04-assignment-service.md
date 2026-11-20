# WP-M19-04: the assignment service and the refusal chain

format: small-model
status: planned
phase: 19
milestone: m19
context-budget: 20k tokens
depends-on: WP-M19-02, WP-M19-03
spec: docs/DECISIONS/0039-the-assignment-names-one-technician-and-its-status.md §4; specs/07-escalation.md §7.14 (The state of an assignment)
spec-lines: 50

files-read:

- apps/api/src/escalation/distribution.ts (the current `distributeTicket`, the `assigned` step)
- apps/api/src/tickets/workflow.ts (`transitionTicket`, the `accepted` and `declined` steps)
- specs/07-escalation.md §7.13 (the transition table)

files-write:

- apps/api/src/tickets/assignment.ts (new: `assignTicket`, `answerAssignment`)
- apps/api/src/escalation/distribution.ts (the `assign` path and the refusal chain)

interfaces:

- `assignTicket(database, { ticketId, userId, acceptance, assignedBy | null }): Promise<AssignResult>` — writes `assigned_user_id`, `assignment_status`, `assigned_by_user_id` and one `ticket_events` row through `transitionTicket()`
- `answerAssignment(database, { ticketId, actorUserId, answer: 'accepted' | 'declined' }): Promise<AssignResult>` — only the assigned technician may answer
- on `declined` the escalation calls `nextAssignee(pool, current)` and assigns the next active member with status `offered`; without a next member the status stays `declined`

## Task

1. `assignTicket` runs the `assigned` step of `ticket_transitions`; without that
   step the ticket keeps its state and the result says `changed: false`.
2. `answerAssignment` runs the `accepted` or `declined` step; a user other than
   `assigned_user_id` gets `403`-style result `not_assignee`.
3. The refusal chain is called from `answerAssignment` on `declined` when the
   escalation action has `mode = pool`; `ticket_assignees` is not written.

## Non-goals

- No route (WP-M19-05), no UI (WP-M19-06), no notification (WP-M19-07).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

Expected: integration tests for accept, decline with the next pool member, decline
with an empty rest of the pool, and a foreign answer; the tests fail before the change.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
