# WP-M2-18b: Ticket detail UI (web)

format: small-model
status: implemented
depends-on: WP-M2-18a
phase: 2
context-budget: 22k tokens
spec: PLAN.md §14 (ticket detail with history, photos, timeline)
spec-lines: 40

files-read:

- apps/api/src/tickets/detail.ts — GET /api/v1/tickets/:ticketNo contract
- packages/shared/src/schemas/ticket.ts — ticketDetailResponseSchema
- apps/web/src/lib/api.ts — apiFetch client
- apps/web/src/features/tickets/ticket-list-page.tsx — existing ticket page pattern

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/routes/index.tsx — /tickets/:ticketNo route
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `TicketDetailPage` React component: loads GET /api/v1/tickets/:ticketNo, renders
  ticket header (number, object, status badge, priority badge, times), event history
  timeline (type, actor, time, payload summary), and photo list. Action buttons
  (review, assign, accept, acknowledge, close) are disabled placeholders until
  phase 4 (transitionTicket).
- Route `/tickets/:ticketNo` guarded by `RequireSession`, permission `ticket.read`
  enforced server-side

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: detail page with ticket
   header, event history timeline, photo list, and disabled action buttons;
   error handling for 404 ticket_not_found.
2. `apps/web/src/routes/index.tsx`: add guarded `/tickets/:ticketNo` route.
3. `apps/web/src/i18n/locales/{de,en}/ticket.json`: add `ticket.detail.*` keys.

## Non-goals

- Status transitions (review, assign, accept, acknowledge, close) — phase 4 (WP-M2-19)
- Photo download (volume access, phase 10)
- Comments, pauses — later phases

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
- Interfaces added: `TicketDetailPage`, `/tickets/:ticketNo` route, `ticket.detail.*` i18n keys
- Follow-up WP: WP-M2-19 (transitionTicket state machine)
