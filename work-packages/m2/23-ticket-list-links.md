# WP-M2-23: ticket list links to the detail and reads the query parameters

format: small-model
status: implemented
depends-on: WP-M2-17b, WP-M2-22
phase: 2
context-budget: 20k tokens
spec: PLAN.md §14 (ticket list with filters, saved views), PLAN.md §13 (dashboard tiles link into the list)
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-list-page.tsx — the list page
- apps/web/src/features/dashboard/start-page.tsx — the tile links
- apps/web/src/routes/index.tsx — route table

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- work-packages/m2/23-ticket-list-links.md

interfaces:

- The ticket list reads its filters from the URL: `search`, `status`,
  `priority`, `open`, `overdue`. Changing a filter updates the URL, so the
  dashboard tiles (`/tickets?open=true`, `/tickets?overdue=true`,
  `/tickets?status=NEW`) open the list with the matching filter.
- Every row links to `/tickets/:ticketNo`; the ticket number and the "Anzeigen"
  action are links, the ticket number is the primary one.

## Task

1. `apps/web/src/features/tickets/ticket-list-page.tsx`: replace the local
   filter state with `useSearchParams`, so the URL is the single source of truth.
   Add the `open` and `overdue` filters to the filter bar. Turn the "Anzeigen"
   button and the ticket number into links to the detail page.

## Non-goals

- Saved views ("mine", "pool", "overdue") — phase 9
- Assignment filter (`assigned_user_id`) — phase 4 adds the column to the list

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green.

## Handoff

- Files changed: the two files above
- Interfaces added: URL-driven ticket list filters, row link to the detail
- Follow-up WP: WP-M2-24 (admin area navigation audit)
