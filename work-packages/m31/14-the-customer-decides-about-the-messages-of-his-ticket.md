# WP-M31-14: the customer decides about the messages of his ticket

format: ctx-256k
status: planned
depends-on: WP-M31-13
phase: 31
milestone: m31
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.6 (the opt-in of the reporter), §19.10 (the routes), §19.11 (the pages)
spec-lines: 40
changed-lines: 300

files-read:

- specs/19-customer-portal.md §19.6 (the opt-in), §19.10 (the routes), §19.11 (the pages)
- apps/api/src/customers/routes.ts (the routes of the portal)
- apps/api/src/customers/**tests**/portal.integration.spec.ts (the pattern of the test)
- apps/web/src/features/customer/portal-tickets-page.tsx (the pages of the portal)
- packages/shared/src/schemas/customer.ts (the contracts of the portal)
- apps/web/src/i18n/locales/de/customer.json (the texts of the portal)

files-write:

- apps/api/src/customers/routes.ts
- apps/api/src/customers/**tests**/portal.integration.spec.ts
- apps/web/src/features/customer/portal-tickets-page.tsx
- packages/shared/src/schemas/customer.ts

interfaces:

- `PATCH /api/v1/customer/tickets/:ticketNo/notifications` — the decision of the customer about the messages
- `customerNotificationsRequestSchema` — the body `{ emailNotifications }`
- `customerTicketSummarySchema` — the field `emailNotifications`

## Task

1. **The opt-in belongs to the reporter** (§19.6, ADR-0056): the ticket carries
   the decision, and the customer may change it himself — in the portal, not
   only in the report form.
2. **The route** `PATCH /api/v1/customer/tickets/:ticketNo/notifications` behind
   `ticket.customer.read`: it changes the ticket of the signed-in customer and
   answers `404 ticket_not_found` for the ticket of somebody else.
3. **The answers** of the list and of the detail carry the flag, so the portal
   shows the decision of the customer.
4. **The page** shows the switch in the detail of a ticket and writes the
   decision.
5. **The test** proves that the customer changes his own ticket and that the
   ticket of somebody else does not exist for him.

## Non-goals

- No change of the action `notify_reporter` — it reads the flag.
- No mail about the decision itself.

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

- Files changed: the route, the test, the page and the contracts
- Interfaces added: the route of the decision and the field of the flag
- Verified: the commands above
- Follow-up WP: WP-M31-15 — the customer sees the reports of his address
- Open question: none
