# WP-M31-08: the portal of the customer — his own open tickets

format: ctx-256k
status: planned
depends-on: WP-M31-07
phase: 31
milestone: m31
context-budget: 55k tokens
spec: specs/19-customer-portal.md §19.5 (the portal of the customer), §19.10 (the routes), §19.11 (the pages)
spec-lines: 40
changed-lines: 600

files-read:

- specs/19-customer-portal.md §19.5 (the portal), §19.10 (the routes), §19.11 (the pages)
- apps/api/src/tickets/list.ts (the list of the tickets, the states of the end)
- apps/api/src/tickets/detail.ts (the history of a ticket)
- apps/api/src/auth/requirePermission.ts (the guard of a route)
- apps/api/src/db/schema.ts (the tables `tickets`, `ticket_events`, `object_assignments`)
- apps/web/src/features/tickets/status-page.tsx (the page outside the shell)
- apps/web/src/routes/index.tsx (the public routes outside the shell)
- packages/shared/src/schemas/customer.ts (the answers of the portal)

files-write:

- apps/api/src/customers/routes.ts
- apps/api/src/customers/**tests**/portal.integration.spec.ts
- apps/api/src/index.ts
- apps/web/src/features/customer/portal-tickets-page.tsx
- apps/web/src/routes/index.tsx

interfaces:

- `GET /api/v1/customer/tickets` — the own open tickets
- `GET /api/v1/customer/tickets/:ticketNo` — the detail of an own ticket
- `GET /api/v1/customer/objects` — the own objects
- `PortalTicketsPage` / `PortalTicketPage` — the pages of the portal
- the routes `/portal/tickets` and `/portal/tickets/:ticketNo`

## Task

1. **The routes** `apps/api/src/customers/routes.ts` behind the permissions
   `ticket.customer.read` and `object.customer.read`: the own open tickets,
   the detail of an own ticket and the own objects. A ticket of somebody else
   is `404 ticket_not_found`; the internal entries of the history never reach
   the portal.
2. **The registration** of the routes in `apps/api/src/index.ts`.
3. **The pages** `apps/web/src/features/customer/portal-tickets-page.tsx`: the
   list of the open tickets with the number, the object and the state, the
   objects of the customer and the detail of a ticket with the history.
4. **The routes** `/portal/tickets` and `/portal/tickets/:ticketNo` outside the
   shell of the app.
5. **The test** proves that the customer sees his own ticket and nothing else,
   that the ticket of another customer is `404`, that the internal comment
   stays in the office and that the internal routes of the office answer
   `403 forbidden` for the customer.

## Non-goals

- No write of the customer in the portal — the customer reads his reports.
- No text of the office in the portal.
- No change of the internal list of the tickets.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the routes of the portal, the registration, the test and the
  pages of the portal
- Interfaces added: the three routes and the two pages
- Verified: the commands above
- Follow-up WP: WP-M31-09 — the report by QR code registers the customer
- Open question: none
