# WP-M46-03: an open ticket is a ticket without a final status

format: ctx-256k
status: planned
depends-on: —
phase: 46
milestone: m46
context-budget: 60k tokens
spec: specs/13-ui.md §14.12; specs/06-report-form.md §7.8.1; specs/19-customer-portal.md; specs/07-escalation.md §7.5
spec-lines: 90
changed-lines: 520

files-read:

- PLAN.md §3, §4.1, §6, §17, §18
- packages/shared/src/schemas/ticket.ts (`OPEN_TICKET_STATUSES`, `isOpenTicketStatus`)
- apps/api/src/db/schema.ts (`ticket_statuses.is_terminal`)
- apps/api/src/db/seed/statuses.ts (the meaning of `is_terminal`)
- apps/api/src/tickets/status-service.ts
- apps/api/src/tickets/list.ts, object-ticket.ts, duplicates.ts, report.ts
- apps/api/src/customers/routes.ts

files-write:

- apps/api/src/tickets/status-service.ts
- apps/api/src/tickets/list.ts
- apps/api/src/tickets/object-ticket.ts
- apps/api/src/tickets/duplicates.ts
- apps/api/src/tickets/report.ts
- apps/api/src/customers/routes.ts
- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/**tests**/list.integration.spec.ts
- apps/api/src/tickets/**tests**/object-ticket.integration.spec.ts
- apps/api/src/tickets/**tests**/duplicates.integration.spec.ts

interfaces:

- `openStatusCondition(column)` in `status-service.ts`: the SQL condition
  „the status of this row is not a final one“ —
  `column NOT IN (SELECT key FROM ticket_statuses WHERE is_terminal)`
- `readFinalStatusKeys(database): Promise<Set<string>>` for the checks in
  code
- `CLOSED_STATUSES` leaves `list.ts`; `OPEN_TICKET_STATUSES` and
  `isOpenTicketStatus` stay in the shared contract, marked deprecated, until
  WP-M46-04 removes their last readers

## Task

The office ends a ticket with an escalation action „Statuswechsel“ that sets a
status of its own, for example „Erledigt“, marked as **Final** in the status
administration (`is_terminal`, „a status after which a ticket leaves the
workflow“). The code never reads that flag: „open“ is a hard-coded list in
about ten places — `OPEN_TICKET_STATUSES` (the seven seeded workflow statuses)
in the shared contract and `CLOSED_STATUSES = ['CLOSED', 'CANCELLED']` in the
ticket list. A ticket set to a custom final status therefore counts as
**open** in the list (`NOT IN CLOSED_STATUSES`) and as **closed** after a QR
scan (`isOpenTicketStatus` is false for an unknown key). The review saw the
reverse as well: a quittiertes ticket („Behoben“) is still „offen“ for the
reporter, which is correct by the rule of the office — only a final status
ends it.

1. `status-service.ts`: add `openStatusCondition` and `readFinalStatusKeys`.
   A status key missing from `ticket_statuses` counts as open (a ticket is
   never lost from the list of the office).
2. `list.ts`: the filters `open`, `closed` and `overdue` use the condition
   instead of `CLOSED_STATUSES`.
3. `object-ticket.ts`, `duplicates.ts`, `report.ts`: the open ticket of an
   object, the duplicate hint of the report form and the parent of a new
   report use `readFinalStatusKeys`.
4. `customers/routes.ts`: the portal orders the open tickets first by the
   same rule (`specs/19-customer-portal.md`, „not a terminal one“).
5. `packages/shared/src/schemas/ticket.ts`: mark `OPEN_TICKET_STATUSES` and
   `isOpenTicketStatus` as deprecated with a pointer to the new helpers; the
   readers of WP-M46-04 still compile.
6. Tests: a status `DONE` with `is_terminal = true` set on a ticket — the
   ticket leaves the default list, appears with `closed=true`, is not the
   open ticket of its object and is no duplicate hint; a status with
   `is_terminal = false` keeps the ticket open; `CLOSED` and `CANCELLED`
   behave as before.

## Non-goals

- The dashboard, the statistics, the escalation job and the pauses
  (WP-M46-04).
- No change of the status administration or of the seed.
- No redesign of the workflow or of the escalation — the office plans to
  rethink both; this package only makes „open“ follow the existing flag.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the `DONE` case of the list test fails before the
change. The integration tests need the database — without it the gate is
reported as unverified (`PLAN.md` §18).

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M46-04 (the remaining readers of the hard-coded lists)
- Open question (if any):
