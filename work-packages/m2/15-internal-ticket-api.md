# WP-M2-15: Internal ticket creation API (server)

format: small-model
status: implemented
depends-on: WP-M2-14, WP-M1-08
phase: 2
context-budget: 22k tokens
spec: PLAN.md §7 (ticket workflow, rule 1), PLAN.md §6 (tickets table), specs/02-data-model.md §4.8
spec-lines: 60

files-read:

- apps/api/src/tickets/report.ts — public report endpoint pattern (transaction, event)
- apps/api/src/auth/sessionPlugin.ts — sessionPlugin, requireUser
- apps/api/src/auth/requirePermission.ts — requirePermission
- packages/shared/src/schemas/ticket.ts — existing ticket schemas
- apps/api/src/db/schema.ts — tickets, ticket_events tables

files-write:

- apps/api/src/tickets/internal.ts — POST /api/v1/tickets route + service
- apps/api/src/index.ts — register internal ticket route
- packages/shared/src/schemas/ticket.ts — internalCreateTicketRequestSchema

interfaces:

- `POST /api/v1/tickets` — requires `ticket.create` permission, body: objectId,
  systemId?, title?, description?, faultTemplateKeys?, priority?, contact?
  Creates a `tickets` row with `status = 'NEW'`, `source = 'INTERNAL'`,
  auto-generated `ticket_no` and `status_token`, plus one `ticket_events` row
  `type = 'created'` with `actor_kind = 'user'`.

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `internalCreateTicketRequestSchema`
   and `internalCreateTicketResponseSchema` (ticketId, ticketNo, status, statusToken,
   reportedAt, receivedAt, deadlineAt) plus TypeScript exports.
2. `apps/api/src/tickets/internal.ts`: `createInternalTicket(database, input, actorUserId)`
   service — resolves object (must be active), validates system belongs to object,
   inserts ticket with `status = 'NEW'`, `source = 'INTERNAL'`, generated
   `ticket_no`/`status_token`, writes `created` event with `actor_kind = 'user'`,
   returns the created ticket summary. Export `internalTicketRoutes` as a fastify-plugin
   with `POST /api/v1/tickets` guarded by `requirePermission(database, PERMISSIONS.ticket.create)`.
3. `apps/api/src/index.ts`: register `internalTicketRoutes` with `{ database }` options.

## Non-goals

- Work order (AA/SA) — arrives in phase 4
- Assign/offer/claim — arrives in phase 4
- `transitionTicket()` state machine — arrives in phase 4 (WP-M2-19)
- Outbox notification — arrives in phase 7

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. Needs a database for integration tests; without one they skip.

## Handoff

- Files changed: the three files above
- Interfaces added: `POST /api/v1/tickets`, `createInternalTicket`, `internalCreateTicketRequestSchema`
- Follow-up WP: WP-M2-16 (internal ticket creation UI)
