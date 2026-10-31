# StörDesk — Specification Slices

These files hold the expanded functional and technical specification of
**StörDesk**. The binding summary is [`PLAN.md`](../PLAN.md); a slice becomes
authoritative only when it contains real content and has been reviewed. Until
then, the matching section of `PLAN.md` wins.

Implementation happens only through a work package from `work-packages/`, never
directly from a placeholder slice.

## File overview

| File                                           | Content               | Size       |
| ---------------------------------------------- | --------------------- | ---------- |
| [00-conventions.md](00-conventions.md)         | Ch. 0 + 2 + 2a        | ~120 lines |
| [01-rbac.md](01-rbac.md)                       | Ch. 3 + 4.1           | ~200 lines |
| [02-data-model.md](02-data-model.md)           | Ch. 4                 | ~250 lines |
| [03-ticket-workflow.md](03-ticket-workflow.md) | Ch. 5 + 5.x additions | ~200 lines |
| [04-oncall.md](04-oncall.md)                   | Ch. 5a                | ~280 lines |
| [05-timeline.md](05-timeline.md)               | Ch. 6                 | ~80 lines  |
| [06-report-form.md](06-report-form.md)         | Ch. 7                 | ~155 lines |
| [07-escalation.md](07-escalation.md)           | Ch. 8                 | ~80 lines  |
| [08-objects-api.md](08-objects-api.md)         | Ch. 9                 | ~180 lines |
| [09-offline.md](09-offline.md)                 | Ch. 10                | ~180 lines |
| [10-notifications.md](10-notifications.md)     | Ch. 11                | ~150 lines |
| [11-dashboard.md](11-dashboard.md)             | Ch. 12                | ~60 lines  |
| [12-stats.md](12-stats.md)                     | Ch. 13                | ~80 lines  |
| [13-ui.md](13-ui.md)                           | Ch. 14                | ~60 lines  |
| [14-nfr.md](14-nfr.md)                         | Ch. 15                | ~120 lines |
| [15-work-packages.md](15-work-packages.md)     | Ch. 17 + 17a          | ~200 lines |
| [16-acceptance.md](16-acceptance.md)           | Ch. 18 + 19           | ~180 lines |

## Rules

- Each file covers exactly the chapters listed above, nothing more.
- If the chapter content is missing, the file stays a placeholder; nothing is
  invented and nothing is implemented early.
- Specification changes are a separate `docs(spec)` commit.
- Chapter numbers stay stable; new chapters are appended as `x` (for example
  Ch. 5.x) so existing references remain valid.
- `PLAN.md` is the source for a placeholder slice. Copy the relevant section
  into the slice, review it, then remove the placeholder marker.

## Boundaries

- `specs/` = **what** is built (domain logic, data model, requirements).
- `PLAN.md` = binding scope, stack, phases, work-package limits, open decisions.
- `AGENTS.md` = **how** work happens in the repository (conventions, quality,
  workflow).
- `docs/` = supplied material and supporting documentation.
