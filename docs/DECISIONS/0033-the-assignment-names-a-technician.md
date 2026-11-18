# ADR-0033: The assignment names a technician, the notification reaches the assigned technician

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, manager, admin

## Context

The escalation configuration of `specs/07-escalation.md` §7.5 knows the
distribution actions of ADR-0026: an `offer` and an `assign` action. Both carry
a `target` — a readiness pool (`pool`) or a user group (`group`) — and both
reach every active technician of that target. The `notify` action carries a
target as well (ADR-0030): one user (`user`) or a readiness pool (`pool`).

The office asked for two changes:

1. „bei der aktion auftrag zuweisen in den einstellungen eskalationen muss es
   möglich sein, einem techniker / mitarbeiter das ticket zuzuweisen" — the
   action „Ticket zuweisen" must be able to name **one** technician of the
   installation, not only a whole pool or a whole group.
2. „dieser assigned benutzer soll dann auch im nachgang als assigned user
   (zugewiesen oder freiwillig nach ‚angeboten' angenommen) auswählbar sein um
   ihm eine nachricht zu schicken" — the technician who works on the ticket
   must be reachable with a message: the `notify` action needs a recipient
   „the assigned technician of this ticket".

The data model answers the second question only half: `ticket_assignees`
(`specs/02-data-model.md` §4.13) holds the technicians of an **escalated**
assignment, but a ticket that a technician **took himself** — he claimed an
offer or accepted it — has no row there, so the office cannot address him.

## Decision

1. **The target of a distribution action gains the kind `user`.** The target
   union of §7.14 becomes `{ kind: 'pool' | 'group' | 'user', id }`. A user
   target names one row of `users`; its technicians are that user — if the
   account is active. A deactivated account is nobody, so the action changes
   nothing, exactly like an empty pool.
2. **The assignees of a ticket are the technicians who work on it.** The
   `ticket_assignees` table keeps every technician of the ticket: the
   technicians of an escalated assignment (ADR-0026) and the technician who
   takes the ticket himself — the `claimed` and the `accepted` step of the
   workflow, performed by a user. The rows are the current state of the
   distribution, the events of the workflow stay its history.
3. **The `notify` action gains the target kind `assigned`.** It carries no id:
   the dispatcher resolves the assignees of the ticket at the moment the rule
   fires. A ticket without an assignee reaches nobody — the action writes
   nothing, like a target without a recipient.
4. **The delivery stays personal.** The assigned technician receives the
   message on his own ntfy topic, like every other personal addressee; the
   per-user routing of the other channels stays a named limitation (ADR-0026,
   ADR-0030).

## Alternatives

- **A new column `tickets.assigned_user_id`.** Rejected: the column exists and
  holds exactly one technician; no service writes it today, and a distribution
  has no single owner. The table of the assignees is the honest model.
- **A list of users in the configuration of the rule.** Rejected: the
  technician who works on a ticket is a fact of the ticket, not of the rule
  that fired. A rule that names users would have to be edited for every
  technician of the installation.
- **The notification reaches the offer recipient (`offered_to_user_id`).**
  Rejected: an offer is no assignment — the technician may decline it, and a
  declined offer would then notify somebody who does not work on the ticket.
- **The `assign` action writes into `tickets.assigned_user_id`.** Rejected: the
  column carries one technician and the pool assignment has several; the table
  of §4.13 stays the one place of the assignees.

## Consequences

- The administration of the escalation can name a single technician for the
  action „Ticket zuweisen" — the technician of the installation, with the name
  the office knows.
- A message can address the technician of the ticket: the `notify` action with
  the target `assigned` reaches whoever took the ticket, whether the
  escalation assigned him or he took it himself.
- A ticket whose technician has not taken it yet has no assignee: the
  `assigned` target reaches nobody. The rule that fires before the ticket is
  distributed stays silent — it is the office channel that carries the ticket
  in that phase.
- The assignees of a ticket are read from the table of §4.13; a ticket that is
  deleted takes its assignees with it (`ON DELETE CASCADE`).
