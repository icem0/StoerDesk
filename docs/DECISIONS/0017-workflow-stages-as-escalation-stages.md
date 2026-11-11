# ADR-0017: The workflow milestones are the escalation stages

- Status: accepted
- Date: 2026-11-11
- Stakeholders: office, manager, admin, on-call

## Context

The repository carried two escalation systems next to each other.

1. The **workflow** of `apps/api/src/tickets/workflow.ts`: `NEW → IN_REVIEW →
   WORK_ORDER_CREATED → {OFFERED, ASSIGNED} → ACCEPTED → ACKNOWLEDGED → CLOSED`.
   The office walks a ticket through it with one button per step.
2. The **escalation stages**: a freely definable catalogue
   (`packages/shared/src/schemas/escalation-stages.ts`, the settings row
   `ticket.escalation_stages`) with the levels `office`, `group`, `assignee` and
   `manager`, selectable per ticket (`POST /api/v1/tickets/:ticketNo/escalate`,
   the event `escalation_set`) and configurable in
   `/admin/escalation-stages`.

The two systems answered the same question twice: *to whom does this ticket
belong now?* The workflow answers it with the status, the catalogue with a second
hierarchy. The catalogue was also inert in the direction that matters: choosing a
stage wrote an event, but changed neither the status nor the assignment, so the
office had to press the workflow button as well. The automatic rules were a third
place: `packages/shared/src/escalation.ts` held six hard-coded rules with a `level`
(`office`, `group`, `assignee`, `manager`) that only the minutes were configurable
for, and the rules wrote an `escalated` event without any consequence — no
notification, no webhook, no recipient.

The office asked for one thing: a configurable logic of escalation levels with a
selection of what happens in which level, dependencies between the levels and
everything configurable — a webhook when a level is reached, but only when a
condition applies.

## Decision

1. **The stages are the workflow milestones.** The five stage keys `review`,
   `work_order`, `assignment`, `acceptance` and `acknowledgement` are fixed by
   the workflow; the display names, the active flag and the deadlines are
   maintained in the administration. No free stage can be added, so a second
   hierarchy cannot grow next to the workflow.
2. **A stage is a milestone to be reached, not a state to sit in.** The deadline
   of a stage is the time a ticket may wait for that milestone; the clock starts
   at the reference event of the stage and pauses with the ticket. The four
   status rules of ADR-0008 map onto the stages `review`, `assignment` and
   `acceptance` (the last one twice, for the offered and for the assigned
   ticket), the two stages `work_order` and `acknowledgement` are new, and the
   two deadline rules stay global.
3. **The manual catalogue, the `escalation_set` event and the manual escalation
   route are removed.** The workflow records who reached which milestone; the
   ticket view selects a stage and performs the transition of that milestone
   instead of writing a note.
4. **The configuration is relational and in the database**: `escalation_stages`,
   `escalation_rules`, `escalation_actions` and `escalation_firings`. The rules
   are not code any more, so an installation can change them without a release.
   The `key` is the identity, not the UUID.
5. **Conditions are a typed builder**, not an expression language: a closed list
   of fields and operators, at most two levels, evaluated by a pure function in
   `packages/shared`. Every rule and every action carries a condition.
6. **The actions of the first version never change a ticket**: `notify` (a subset
   of the configured channels), `webhook` (selected endpoints of the
   administration) and `history` (an append-only note). A state change as an
   action is a later decision, because it needs a loop and permission guard of
   its own.
7. **Exactly once per rule and threshold** is guaranteed by the unique key of
   `escalation_firings`, not by an application-side scan.

## Alternatives

- **Keep the manual catalogue and add conditions and actions to it.** Rejected:
  the catalogue is the second hierarchy; the stages would keep their own order
  while the workflow keeps its own, and the office would choose a stage that
  contradicts the status.
- **Keep the stages configurable in their number (free catalogue).** Rejected for
  the same reason: the whole point of the change is one system.
- **Keep the hard-coded rules in `packages/shared` and only make the minutes
  configurable.** Rejected: the request is a logic of levels with actions and
  dependencies; minutes alone does not reach it.
- **Free expression language for the conditions.** Rejected: a condition that is
  written by an administrator is code the server executes; the typed list is
  validatable, testable and safe.
- **Store the configuration in a `settings` row (JSON).** Rejected: rules refer
  to each other, to stages and to their actions; a relational model keeps those
  references, the per-row editing and the audit of the configuration intact.
- **Actions that change status, assignment or priority.** Deferred, not
  rejected: they need a cycle guard, a permission per action and a dry run.

## Consequences

- The workflow and the escalation share one vocabulary: the stage is the
  milestone, the rule is the deadline of that milestone, the action is the
  consequence.
- The ticket view has one control for the milestones instead of one button per
  step; the forms of the steps (AA/SA number, assignee, result) stay.
- The former settings rows `ticket.escalation.<rule>.minutes` and
  `ticket.escalation_stages` are read once during the migration and are
  read-only afterwards.
- A rule change applies to the tickets that are scanned after the change; the
  deadlines of the running tickets follow the configuration of the moment.
- The administration needs a new page (`/admin/escalation`) with the deadlines,
  the stages and the rules; the old stage page disappears.
