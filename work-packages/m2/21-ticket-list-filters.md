# WP-M2-21: ticket list filters (open, overdue) and ordering

format: small-model
status: in_progress
depends-on: WP-M2-17
phase: 2
context-budget: 20k tokens
spec: PLAN.md §13 (dashboard tiles: open tickets by status, overdue, without review)
spec-lines: 30

files-read:

- apps/api/src/tickets/list.ts — listTickets service and its filters
- packages/shared/src/schemas/ticket.ts — ticketListQuerySchema
- specs/13-ui.md — dashboard tiles

files-write:

- packages/shared/src/schemas/ticket.ts — extend ticketListQuerySchema
- apps/api/src/tickets/list.ts — implement the new filters and the ordering
- work-packages/m2/21-ticket-list-filters.md

interfaces:

- `ticketListQuerySchema` gains `open?: boolean` (status is neither `CLOSED` nor
  `CANCELLED`), `overdue?: boolean` (`deadline_at` is in the past and the ticket
  is still open), `order?: 'reportedAt' | 'deadlineAt' | 'priority'` (default
  `reportedAt`) and `direction?: 'asc' | 'desc'` (default `desc`).
- `GET /api/v1/tickets` accepts the new query parameters; the response keeps
  `{ tickets, total, limit, offset }`. The default order changes from ascending
  to descending `reportedAt`, so the newest ticket comes first.

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `open`, `overdue`, `order` and
   `direction` to `ticketListQuerySchema`.
2. `apps/api/src/tickets/list.ts`: apply the filters in `whereFromQuery`-style
   conditions (`notInArray` for the closed statuses, `lt(tickets.deadlineAt, now)`
   for overdue) and order by the selected column and direction. Priority order
   uses `critical, high, normal, low`.

## Non-goals

- Dashboard page (WP-M2-22)
- Statistics and CSV export (phase 9)
- Saved views ("mine", "pool", "overdue") — phase 9

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the three files above
- Interfaces added: `open`, `overdue`, `order`, `direction` query parameters
- Follow-up WP: WP-M2-22 (dashboard start page)
