# ADR-0041: The workflow events set the status; no transition table

- Status: accepted
- Date: 2026-11-20
- Stakeholders: office, manager, admin
- Supersedes: ADR-0025 (the ticket transitions as database configuration)

## Context

ADR-0025 turned the steps between the ticket statuses into the table
`ticket_transitions`: a row named the status, the event and the target, and
`transitionTicket()` refused an event that no row allowed from the current status
(`409 invalid_transition`). The `status_change` action of an escalation stage
performed a row of that table as well and changed nothing when none matched.

The workflow is configured through the escalation stages (`specs/07-escalation.md`
§7.4 to §7.12): a stage names the status it moves a ticket to, and every change is
documented in the ticket history as an `escalation_note`. A second check of the
transition between two statuses adds no protection the history does not already
give, and it blocks configurations the office wants (a stage that moves a ticket
from any status). The table and its administration page therefore carry a rule
nobody uses in practice.

## Decision

1. **`ticket_transitions` is removed** (migration `0053`). The table, its
   foreign keys, the administration page `/admin/transitions`, its API routes
   `/api/v1/admin/transitions` and the shared types are gone.
2. **A workflow event sets its status.** `apps/api/src/tickets/workflow.ts` keeps
   one code map `WORKFLOW_EVENT_STATUS` from event key to target status. Every
   event has exactly one target, so the map is the whole rule. `transitionTicket()`
   writes that status, the workflow columns and one `ticket_events` row in one
   transaction. It does not read the previous status and does not refuse an event
   because of it. An unknown event key answers `400 invalid_event`.
3. **`status_change` sets the status directly.** The action of an escalation stage
   writes its configured `toStatus` and one `escalation_note` event with
   `{ rule, stage, from, to }`. It does not go through `transitionTicket()`, so the
   side effects of the events (offers, assignees, pauses) are not run by it.
4. **The stages decide when a status is set.** `readReachableStages()` offers every
   active stage with its `reached_by` events that are known workflow events; the
   status of the ticket is no condition any more.
5. **The statuses stay configurable.** The rows of `ticket_statuses` and their
   key-format check (`0040`) are unchanged; the status a ticket carries stays plain
   text as history.

## Alternatives

- **Keep the table, remove only the administration page.** Rejected: the table
  would still be the source of the transition check and a second definition of
  the workflow.
- **Keep the check but in code.** Rejected by the office: the check is the
  restriction being removed, not the place where it lives.
- **Rename the escalation administration to "workflow administration".** Not part
  of this decision; it is a naming change to decide separately.

## Consequences

- A ticket can move to any status through an event or a stage. The history is the
  only record of how it got there.
- The atomic claim rule of `PLAN.md` §12 (the first acceptance wins) is no longer
  enforced by the `UPDATE … WHERE status = <from>` guard: `transitionTicket()`
  updates by ticket id. Two concurrent events on one ticket both apply, the later
  one last. This must be reviewed against the claim rule before the next claim
  feature.
- The on-call offer keeps its own precondition (`WORK_ORDER_CREATED`) in
  `oncall/coupling.ts`; that is a rule of the on-call calendar, not of the
  workflow table, and it stays.
- Existing installations lose the 22 seeded rows and the administration page; no
  ticket status changes, because the statuses are not touched.
