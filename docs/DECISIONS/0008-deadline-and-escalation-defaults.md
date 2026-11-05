# ADR-0008: Deadline and escalation defaults per priority

- Status: accepted
- Date: 2026-11-05
- Stakeholders: office, manager, admin, on-call

## Context

`PLAN.md` §9 requires a 72-hour timeline, deadlines per priority and escalation
rules that run 24/7. `PLAN.md` §19 lists "default deadlines per priority and
contract type" as an open decision: the number of hours per priority was never
fixed, so phase 6 could not compute a deadline or a rule clock without inventing
values.

## Decision

The defaults are:

| Priority | Deadline | `NEW` review | `OFFERED` claim |
| --- | --- | --- | --- |
| `low` | 168 h | 15 min | 20 min |
| `normal` | 72 h | 15 min | 20 min |
| `high` | 24 h | 15 min | 20 min |
| `critical` | 8 h | 5 min | 10 min |

`work_order_without_distribution` is 30 min and `assigned_without_accept` is
15 min for every priority. The escalation percentages are 80 % and 100 % of the
timeline.

The values are constants in `packages/shared/src/timeline.ts`. A `settings` row
`ticket.deadline_hours.<priority>` or
`ticket.escalation.<rule>.minutes` overrides a value when it holds a positive
integer, so an installation can adjust without a code change. QR reports stay
`normal` (`PLAN.md` §10), so their deadline remains 72 h.

Contract-type deadlines are deferred: `contracts_refs` is not part of the
running phases yet, and no current work package may invent it. When the
contract table arrives it overrides the priority default for its object.

## Alternatives

- **One fixed 72-hour deadline for all priorities.** Rejected: it contradicts
  the critical-priority shortening of `PLAN.md` §9.
- **Deadline stored per ticket at creation only.** Kept — the row does store it
  — but the shared function stays the single source for the calculation, so a
  later settings change has a defined entry point.
- **Configuring the values in `.env`.** Rejected: the project keeps domain
  configuration in `settings`, and the existing BMA sync already does so.

## Consequences

- Phase 6 has concrete, testable values without waiting for a contract model.
- A change of a default needs a new ADR or a `settings` override, not a silent
  edit in a ticket service.
- Contract-type deadlines remain an explicit follow-up when `contracts_refs`
  is implemented.
