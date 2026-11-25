# ADR-0057: The assignment names a target of the installation

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, on-call technicians, administration

## Context

ADR-0039 gave the assignment of the office a pool of its own: the setting
`escalation.assignee_pool` held an **ordered list of user ids**, maintained in
the administration under the tab _Pool der Office_. The action `assign` took
the first member of that list, a refusal passed the ticket to the next member,
and the ticket view offered the members of the list in its picker.

The installation already knows two kinds of pools:

- the **readiness pools** of the on-call calendar (`oncall_pools`), whose
  members are the members of their group or every active user with the role
  `oncall` (ADR-0011, decision 3);
- the **user groups** of the administration (`groups`), whose members live in
  `user_groups`.

Both already answer their members in one order — by name — and the `offer`
action of the escalation already names them as its target (ADR-0026). The
assignee pool was a **third** pool of the same technicians: the office had to
maintain its technicians twice, and the list of the assignment drifted from
the plan of the readiness.

The office asked for the removal of the pool of the office: the existing pools
are enough, and the assignment shall use them.

## Decision

1. **The assignment names a target.** The target has the shape of the target of
   the `offer` action (§7.14): a readiness pool (`kind: pool`), a user group
   (`kind: group`) or one technician (`kind: user`). The `assign` action of the
   escalation carries that target instead of the mode `pool`/`user`; the mode
   is gone.
2. **The members of the target are the list of the assignment.** The first
   member gets the ticket. The order is the order of the member list — by
   name — of `resolvePoolMemberIds` and `resolveGroupMemberIds`
   (`specs/04-oncall.md` §4a.5); the installation stores no further order.
3. **A refusal passes the ticket to the next member of the target.** The ticket
   stores its target (`tickets.assignment_target_kind`,
   `tickets.assignment_target_id`), so the chain continues in the pool or the
   group the assignment was made in. A target of the kind `user` has no
   successor: the ticket keeps the status `declined` and the rule of the
   escalation decides what happens next.
4. **The setting and the tab are gone.** `escalation.assignee_pool` and the tab
   _Pool der Office_ are removed; the ticket view offers the pools, the groups
   and the technicians of the installation as the targets of the assignment.

## Alternatives

- **Keep the assignee pool as a third list of technicians.** Rejected: it
  duplicates the readiness pools and the user groups, and the office has to
  maintain it beside them.
- **A new position column in `user_groups`, so the office orders its groups.**
  Rejected: the office does not want to order the groups of the administration
  — the name order is enough for a refusal chain, and a new column would
  change the administration of the groups.
- **No chain: a refusal ends the assignment.** Rejected: the office wants a
  refusal to reach the next technician of the pool; only the pool itself goes.
- **A dedicated table of the members of the assignment.** Rejected: the members
  of a pool are already derivable, and a copy would drift again.

## Consequences

- Positive: one list of technicians per pool, the assignment follows the plan
  of the readiness, the administration loses a tab and a setting.
- Negative: the order of the chain is the name order, not a chosen order. An
  installation that needs another order needs another decision.
- The stored rules of the escalation that assigned from the pool of the office
  cannot be mapped onto a target — the migration removes those actions; the
  office sets a new target in the administration.
- Supersedes ADR-0039, decision 3 (the pool of the office as a setting). The
  other decisions of ADR-0039 (one assignee per ticket, the status of the
  assignment, the acceptance and the refusal, the notifications) stay in force.
- Follow-up WPs: `WP-M32-01` … `WP-M32-04` (see `work-packages/m32/`).
