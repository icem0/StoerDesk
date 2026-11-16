# ADR-0026: The escalation offers and assigns tickets

- Status: accepted
- Date: 2026-11-16
- Stakeholders: office, manager, admin

## Context

The escalation configuration of `specs/07-escalation.md` §7.5 knows four action
types: `notify`, `webhook`, `history` and — since WP-M14-40 — `status_change`.
They are side effects: they write a notification, a delivery, a note or a status
change. `PLAN.md` §9 and §7.12 said it in one sentence: the actions of a rule do
not change the assignment of a ticket.

The office asked for two more: an action that **offers** a ticket to a pool of
technicians and an action that **assigns** technicians. The reason is the
`assignment` stage (§7.1): a ticket waits in `WORK_ORDER_CREATED` for a
technician, and after the deadline of the stage (30 minutes by default) the
escalation fires — but so far it can only write a note. The office wants the
ticket to reach the technicians by themselves: the offer goes to the pool, the
assignment names the technicians who are responsible from now on.

Two answers of the office shape the decision: the target of both actions is
"a pool of technicians" and both a readiness pool and a user group shall be
selectable; the assignment reaches **all** technicians of that target.

The data model has a hole here: `tickets.assigned_user_id` holds exactly one
technician and no service writes it. A ticket assigned to a whole pool needs
several.

## Decision

1. **Two new action types: `offer` and `assign`.** Both carry a `target`:
   `{ kind: 'pool' | 'group', id }` — a row of `oncall_pools` or a row of
   `groups`. The target lives in the `config` jsonb of the action, like the
   target status of the `status_change` action; jsonb carries no foreign key, so
   the configuration service validates the target (`400 invalid_target`).
2. **The technicians of a target are its active members.** For a readiness pool
   that is the members of its `group_id`, otherwise every active user holding the
   `oncall` role — the rule of `GET /api/v1/oncall/pools/:id/members`. For a user
   group it is the members of `user_groups`. A target without a technician
   changes nothing.
3. **Both actions perform a step of the `ticket_transitions` table** (§7.13, ADR-0025):
   `offer` performs the `offered` step, `assign` the `assigned` step. A ticket
   whose status has no such step keeps its status and the action writes nothing —
   the rule of the `status_change` action. The offer of a pool target names the
   on-call person of the pool in `offered_to_user_id` and sets the offer timeout
   (`oncall.escalate_to_group_after_min`), so the existing offer timeout hands
   the ticket to the group; a group target has no on-call person and no timeout.
4. **The assignment is a table: `ticket_assignees`** (`ticket_id`, `user_id`,
   `assigned_at`). The primary key over `(ticket_id, user_id)` keeps a technician
   assigned once. `tickets.assigned_user_id` stays the column of a single
   assignment and keeps its meaning; the escalation writes the set, because a
   pool assignment has no single owner.
5. **The broadcast reaches the technicians on their own channels.** Every
   technician of the target is notified for the event type of
   `specs/10-notifications.md` §11.4 — `ticket.escalated` for the offer,
   `ticket.assigned` for the assignment. Only ntfy has an address per user
   (§11.3), so the broadcast writes one outbox row per technician with an ntfy
   account on their own topic. The instance channels would reach the office
   instead of the technician; the office is informed by the `notify` action and by
   the `escalated` event of the firing.
6. **The distribution is an append-only fact.** The firing writes one
   `escalation_note` event with `{ rule, stage, target }`; the workflow step
   writes its own event (`offered`, `assigned`). The assignees of a ticket are
   rows, not events — they are the current state, the events are the history.

## Alternatives

- **A separate target table.** Rejected: a pool and a group are the two
  configurations that already exist; a third one would duplicate their members.
- **Only the on-call pool as the target.** Rejected: the office asked for both a
  readiness pool and a user group; the readiness calendar is not the only
  organisation of technicians in an installation.
- **Assign a single named technician.** Rejected: the office answered "all
  technicians of the pool" — a distribution is the point of the action.
- **Keep `tickets.assigned_user_id` and write only one technician.** Rejected:
  the column cannot hold a pool and no service writes it today either; the new
  table is the honest model of a distribution.
- **A new notification event type for the offer.** Rejected: `ticket.escalated`
  and `ticket.assigned` are already the event types of §11.4 for these two
  cases, and a new type would ask every user for a new selection.

## Consequences

- The escalation can now move a ticket, so the boundary of §7.12 changes: the
  `offer` and the `assign` action distribute a ticket, every other action stays
  a side effect.
- A rule that fires while the ticket is not in `WORK_ORDER_CREATED` changes
  nothing — the distribution needs its step. The administration shows the step
  of the configured transition table, so the rule is readable.
- The broadcast reaches the technicians over ntfy only. An installation without
  ntfy reaches the office, not the pool; the per-user routing of the other
  channels is a named follow-up.
- `ticket_assignees` grows with the tickets that are distributed; a ticket that
  is deleted takes its assignees with it (`ON DELETE CASCADE`).
