# WP-M2-17: Ticket list API (server)

format: small-model
status: implemented
depends-on: WP-M2-15
phase: 2
context-budget: 22k tokens
spec: PLAN.md §6 (tickets table), PLAN.md §13 (dashboard tile: open tickets by status)
spec-lines: 50

files-read:

- apps/api/src/db/schema.ts — tickets, objects tables
- apps/api/src/auth/requirePermission.ts — requirePermission
- packages/shared/src/schemas/ticket.ts — existing ticket schemas
- apps/api/src/tickets/internal.ts — route registration pattern

files-write:

- packages/shared/src/schemas/ticket.ts — ticketListQuerySchema, ticketListResponseSchema
- apps/api/src/tickets/list.ts — GET /api/v1/tickets route + service
- apps/api/src/index.ts — register ticket list route

interfaces:

- `GET /api/v1/tickets` — requires `ticket.read`, query: search, status, objectId,
  priority, limit, offset; returns paginated ticket list with object number/name,
  status, priority, reportedAt, deadlineAt
- `listTickets(database, query, actorUserId)` service — joins tickets with objects
  for display, applies filters, paginates

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `ticketListQuerySchema` and
   `ticketListResponseSchema` plus TypeScript exports.
2. `apps/api/src/tickets/list.ts`: `listTickets` service — joins `tickets` with
   `objects`, filters by search (objectNo/name), status, objectId, priority,
   paginates with limit/offset. Export `ticketListRoutes` as fastify-plugin with
   `GET /api/v1/tickets` guarded by `requirePermission(database, PERMISSIONS.ticket.read)`.
3. `apps/api/src/index.ts`: register `ticketListRoutes` with `{ database }` options.

## Non-goals

- Ticket detail page (WP-M2-18)
- Work order / assign / accept — phase 4 (WP-M2-19)
- Timeline, pauses, escalation — phase 6

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
- Interfaces added: `GET /api/v1/tickets`, `listTickets`, `ticketListQuerySchema`
- Follow-up WP: WP-M2-17b (ticket list UI)
