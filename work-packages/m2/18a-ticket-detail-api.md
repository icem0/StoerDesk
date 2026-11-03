# WP-M2-18a: Ticket detail API (server)

format: small-model
status: implemented
depends-on: WP-M2-17
phase: 2
context-budget: 22k tokens
spec: PLAN.md §6 (tickets, ticket_events, ticket_photos tables), PLAN.md §7 (ticket workflow)
spec-lines: 50

files-read:

- apps/api/src/db/schema.ts — tickets, ticketEvents, ticketPhotos, objects tables
- apps/api/src/auth/requirePermission.ts — requirePermission
- packages/shared/src/schemas/ticket.ts — existing ticket schemas
- apps/api/src/tickets/list.ts — route registration pattern

files-write:

- packages/shared/src/schemas/ticket.ts — ticketDetailResponseSchema
- apps/api/src/tickets/detail.ts — GET /api/v1/tickets/:ticketNo route + service
- apps/api/src/index.ts — register ticket detail route

interfaces:

- `GET /api/v1/tickets/:ticketNo` — requires `ticket.read`, returns the ticket with
  object number/name, status, priority, reportedAt, deadlineAt, reporter contact,
  plus the append-only event history and photo metadata
- `getTicketDetail(database, ticketNo)` service — joins tickets with objects, loads
  ticket_events (ordered by createdAt) and ticket_photos

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `ticketDetailResponseSchema` with
   nested `ticket`, `events` and `photos` arrays plus TypeScript exports.
2. `apps/api/src/tickets/detail.ts`: `getTicketDetail` service — resolves ticket by
   `ticketNo`, joins objects for objectNo/objectName, loads `ticket_events` ordered
   by `createdAt` asc and `ticket_photos` for the ticket. Export `ticketDetailRoutes`
   as fastify-plugin with `GET /api/v1/tickets/:ticketNo` guarded by
   `requirePermission(database, PERMISSIONS.ticket.read)`.
3. `apps/api/src/index.ts`: register `ticketDetailRoutes` with `{ database }` options.

## Non-goals

- Ticket detail UI (WP-M2-18b)
- Work order / assign / accept / close actions — phase 4 (WP-M2-19)
- Photo download (volume access, phase 10)

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
- Interfaces added: `GET /api/v1/tickets/:ticketNo`, `getTicketDetail`, `ticketDetailResponseSchema`
- Follow-up WP: WP-M2-18b (ticket detail UI)
