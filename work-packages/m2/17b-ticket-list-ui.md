# WP-M2-17b: Ticket list UI (web)

format: small-model
status: in_progress
depends-on: WP-M2-17
phase: 2
context-budget: 22k tokens
spec: PLAN.md §13 (dashboard: open tickets by status), PLAN.md §14 (ticket list with filters)
spec-lines: 40

files-read:

- apps/api/src/tickets/list.ts — GET /api/v1/tickets contract
- packages/shared/src/schemas/ticket.ts — ticketListQuerySchema, ticketListResponseSchema
- apps/web/src/lib/api.ts — apiFetch client
- apps/web/src/features/objects/object-list-page.tsx — existing list page pattern

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/routes/index.tsx — /tickets route
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `TicketListPage` React component: fetches GET /api/v1/tickets with Tanstack Query,
  renders a searchable, filterable table (ticketNo, object, status badge, priority badge,
  reportedAt, deadlineAt), row click navigates to ticket detail (WP-M2-18, disabled until then)
- Route `/tickets` guarded by `RequireSession`, permission `ticket.read` enforced server-side

## Task

1. `apps/web/src/features/tickets/ticket-list-page.tsx`: table page with Tanstack Query,
   client-side search over ticketNo/object, server filters status and priority passed as
   query params, status/priority badges with localized labels, row click disabled until WP-M2-18.
2. `apps/web/src/routes/index.tsx`: add guarded `/tickets` route.
3. `apps/web/src/i18n/locales/{de,en}/ticket.json`: add `ticket.list.*` keys.

## Non-goals

- Ticket detail (WP-M2-18)
- Work order / assign / accept actions — phase 4 (WP-M2-19)
- Timeline, pauses — phase 6

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

- Files changed: the four files above
- Interfaces added: `TicketListPage`, `/tickets` route, `ticket.list.*` i18n keys
- Follow-up WP: WP-M2-18 (ticket detail)
