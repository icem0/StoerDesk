# ADR-0030: The readiness shift is a condition of the escalation

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, manager, admin

## Context

The escalation configuration of `specs/07-escalation.md` §7.4 knows the ticket
only: its priority, its status, its source, its type, its assignment, its
deadline, its stages and the time of the day. The readiness calendar
(`specs/04-oncall.md`) is a second world next to it: pools of technicians, the
shifts of a pool and the technician who is on duty at a moment.

The office asked for the two to meet: **the technicians of a readiness service
shall receive a message only when they have a shift**. Until now a `notify`
action with a readiness pool as its target reached every member of that pool —
the whole standby team was woken up, although only one of them was on duty.

The office named the place of the choice: the conditions of the escalation
stages. A condition shall offer the **Bereitschafts-Schicht** and the pool of
the shift shall be selectable there.

Two answers of the office shape the decision: a notification shall reach the
technicians who have a shift — not the whole pool; and a `CONFIRMED`, a
`SWAP_REQUESTED` and a `PLANNED` shift all count as a shift, the same rule the
on-call coupling uses (`specs/04-oncall.md` §4a.6).

## Decision

1. **The conditions gain the field `shift`.** Its value is the uuid of a
   readiness pool; it matches when that pool has a staffed shift at the moment
   of the evaluation. The operators are `eq` (the pool is staffed) and `ne` (the
   pool is unstaffed), so a rule may also ask for the pool without a shift.
2. **The evaluation stays a pure function.** The facts of a ticket carry the
   pools that are staffed at that moment (`staffedPools`); the API collects them
   once per scan, not once per ticket.
3. **A `notify` action with a readiness pool as its target reaches the
   technicians who have a shift in that pool at this moment.** The members of
   the pool without a shift receive nothing. The target of the `offer` and the
   `assign` action keeps its meaning: the offer names the on-call person of the
   pool (§7.14) and the assignment distributes the ticket to the whole team.
4. **The configuration service checks the pool of the condition.** The jsonb of
   the condition carries no foreign key, so `PUT /api/v1/escalation/config`
   answers `400 invalid_target` for a pool that does not exist — the rule of the
   action targets (§7.5).

## Alternatives

- **A second target kind `shift` next to `pool`.** Rejected: two targets for
  one calendar make the administration unreadable, and the office named the pool
  of the shift as the one choice. The whole office is still reachable over the
  channel broadcast of a `notify` action without a target.
- **Only the condition, the target keeps every member.** Rejected: the rule
  would fire only with a staffed pool, but the message would still wake up the
  whole standby team — the opposite of what the office asked for.
- **A new field per technician instead of the pool.** Rejected: the condition
  would then know a person, and the question of the office is about a service,
  not about a name.
- **Only a `CONFIRMED` shift counts.** Rejected: the office named the rule of
  the on-call coupling — a planned shift is a duty, even if it is not confirmed
  yet, and the escalation must not fall silent because nobody pressed a button.

## Consequences

- The scan of the escalation needs the staffed pools: one query per scan, not
  one per ticket. The scan runs every minute (`specs/07-escalation.md` §7.8).
- A pool without a staffed shift delivers nothing. An installation that wants to
  inform the office in any case names the channels of the instance in a second
  `notify` action without a target.
- The condition is a snapshot of the moment of the evaluation: a shift that
  starts after the firing does not reach the ticket of the firing.
