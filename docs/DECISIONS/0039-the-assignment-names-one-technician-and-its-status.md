# ADR-0039: The assignment names one technician and its status

- Status: accepted
- Date: 2026-11-20
- Stakeholders: office, on-call technicians, administration

## Context

The `assign` action of the escalation (ADR-0026, ADR-0033) distributes a ticket
to every technician of a target and records them in `ticket_assignees`. The
office does not want that: a ticket is handled by **one** person. The office
also asked for the following:

- the administration chooses the action target from a **pool of employees**
  that is configured in the escalation settings, or names one technician;
- the ticket stores the assigned person and the **status of the assignment**
  (`offered`, `accepted`, `declined`);
- a declined assignment passes to the **next** person of the pool;
- the person who made the assignment (the _Sachbearbeiter_) is notified when the
  technician accepts or declines.

Until now the target of `assign` was a readiness pool, a group or a user, and
the editor defaulted to a pool, so no single employee could be chosen for an
assignment.

## Decision

1. **One assignee per ticket.** `tickets.assigned_user_id` is the single person
   the ticket is assigned to. It is the column the workflow already uses
   (`claimed`, `accepted`). `ticket_assignees` is no longer written by the
   `assign` action; the table and its read in the ticket view are retired in
   a later work package (WP-M19-06).
2. **Two new columns on `tickets`:**
   - `assignment_status`: `offered`, `accepted`, `declined` or `NULL` (no
     assignment). `offered` waits for the technician, `accepted` is the
     acceptance, `declined` is the refusal.
   - `assigned_by_user_id`: the user who made the assignment, or `NULL` when a
     rule of the system made it. It is the addressee of the notification in
     decision 5.
3. **One assignment action, one pool.** The action `assign` (ADR-0026) keeps its
   key and gains a **mode**: `pool` (the employee is chosen from the assignee
   pool) or `user` (one fixed technician). The assignee pool is an ordered list
   of active users under the escalation settings (`escalation.assignee_pool`,
   maintained in the administration). The action `offer` stays unchanged for the
   on-call pools (ADR-0026, timeout chain).
4. **Acceptance and refusal.** `assign` with the option _Annahme erforderlich_
   sets `assignment_status = offered`; without it, the status is `accepted` at
   once. The technician answers through the workflow: `accepted` sets the status
   `accepted`, `declined` sets `declined`. On `declined` the escalation assigns the
   **next active member** of the assignee pool (the order of the pool) with status
   `offered`; if no further member exists, the ticket keeps `declined` and the
   rule's next action decides.
5. **Notifications.** Three recipients are used:
   - the assigned technician, on `offered` (`ticket.assigned`, target `assigned`);
   - the _Sachbearbeiter_ (`assigned_by_user_id`), on `accepted` and `declined` —
     a new notify target `assigner`;
   - the assigned technician's channels follow ADR-0037 as before.
     Every notification is written to the outbox with the status change as its
     reason.

## Alternatives

- **Keep `ticket_assignees` and add a status column to it.** Rejected: it models
  several technicians per ticket, which the office does not want, and it leaves
  two sources for "who works on this ticket".
- **A new table for the assignment history.** Rejected for now: the ticket
  history (`ticket_events`) already records every assignment and decline as an
  event. A separate table can follow if reporting needs it.
- **Use the on-call offer timeout for the assignment.** Rejected: the timeout
  belongs to readiness shifts; an assignment waits for the technician without a
  clock until a later rule defines one.

## Consequences

- Positive: one person per ticket, one status, a clear addressee for the
  acceptance notice; the pool is a plain setting, not new master data.
- Negative: `ticket_assignees` and the multi-technician distribution of
  ADR-0026 and ADR-0033 are superseded for the `assign` action. The migration
  that retires the table comes after the code no longer writes to it.
- Follow-up WPs: `WP-M19-02` … `WP-M19-06` (see `work-packages/m19/`).
