# WP-M16-24a: the API orders the list the way the office wants

format: small-model
status: done
depends-on: WP-M16-24
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.9; specs/05-timeline.md §5.4
spec-lines: 30

files-read:

- apps/api/src/tickets/list.ts (the order of the list)
- packages/shared/src/schemas/ticket.ts (the query of the staff list)
- apps/api/src/tickets/__tests__/list.integration.spec.ts

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/list.ts
- apps/api/src/tickets/__tests__/list.integration.spec.ts

interfaces:

- `ticketListQuerySchema.order` — the enum keeps `reportedAt`, `deadlineAt` and
  `priority`; the default is `'priority'` (the order of the office)
- `listTickets(database, query)` — `order=priority` sorts the open tickets
  first, then the urgency descending (`critical`, `high`, `normal`, `low`), then
  the nearest deadline, then the ticket number

## Task

1. `packages/shared/src/schemas/ticket.ts` changes the default of `order` in
   `ticketListQuerySchema` from `'reportedAt'` to `'priority'`. The enum and the
   `direction` parameter stay — they belong to the two orders by time.
2. `apps/api/src/tickets/list.ts` turns `order=priority` into the order of the
   office: `OPEN_FIRST` (the open tickets before the closed and the cancelled
   ones), then the urgency rank (`critical` = 1 … `low` = 4) ascending, then the
   deadline ascending and the ticket number as the tie-breaker. The `direction`
   parameter does not change this order; the order by the deadline and the order
   by the report time keep their direction.
3. `apps/api/src/tickets/__tests__/list.integration.spec.ts` proves the order:
   an open ticket of the urgency `normal` stands before an open ticket of the
   urgency `low`, an open ticket of the same urgency with the nearer deadline
   stands first, and the closed ticket stands behind every open ticket.

## Non-goals

- No change of the order by the deadline and of the order by the report time —
  both keep their direction.
- No change of the external API: its list keeps the order by the report time.
- No page, no text and no setting: the list page follows in WP-M16-24b.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run apps/api/src/tickets/__tests__/list.integration.spec.ts
```

Expected: green; the new assertion fails before the change and passes after it.

## Handoff

- Files changed: `packages/shared/src/schemas/ticket.ts`,
  `apps/api/src/tickets/list.ts`,
  `apps/api/src/tickets/__tests__/list.integration.spec.ts`
- Interfaces added: the order of the office as `order=priority` and as the
  default of the staff list
- Verified: `npm run typecheck`, `npm run lint`, the integration spec — the new
  assertion fails before the change and passes after it
- Follow-up WP: WP-M16-24b
- Open question: none
