# WP-M14-149b: the API writes the internal comment

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.3, §3.4; specs/02-data-model.md §4.9; docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md
spec-lines: 40

depends-on: WP-M14-149a

files-read:

- apps/api/src/tickets/internal.ts (the comment route of WP-M5-04)
- apps/api/src/tickets/internal-actions.ts (the service of the internal writes)
- packages/shared/src/schemas/ticket.ts (§3 the public event types)
- packages/shared/src/permissions.ts (the key of WP-M14-149a)

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/internal-actions.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/__tests__/internalActions.routes.integration.spec.ts

interfaces:

- `INTERNAL_TICKET_EVENT_TYPES` — the list of the event types that never reach the customer
- `isInternalTicketEvent(type)` — `true` for an event type of that list
- `POST /api/v1/tickets/:ticketNo/comments/internal` (behind `ticket.comment.internal`) — the write
- the action `internal_comment` of `applyInternalAction` — the event of the trail

## Task

1. `packages/shared/src/schemas/ticket.ts`: next to `PUBLIC_TICKET_EVENT_TYPES`
   the list `INTERNAL_TICKET_EVENT_TYPES` (`['internal_comment']`) and the
   helper `isInternalTicketEvent(type)`. The list is the single place that
   names the event types which never reach the customer.
2. `apps/api/src/tickets/internal-actions.ts`: the action of the service gains
   `internal_comment`; it writes the event of the type `internal_comment` with
   the payload of the caller (the text), `actor_kind = 'user'` and the receipt
   of the idempotency key — the same transaction as every other internal
   write.
3. `apps/api/src/tickets/internal.ts`: the route
   `POST /api/v1/tickets/:ticketNo/comments/internal` behind
   `requirePermission(database, PERMISSIONS.ticket.comment.internal)`. The body
   is the body of the comment route (`clientUuid`, `text`, at most 2000
   characters), the answer is the answer of the comment route (`ticketNo`, `at`,
   `replayed`).
4. The integration test: a colleague with the key writes the note and the
   event of the trail carries the type `internal_comment`; a colleague without
   the key answers `403 forbidden`; a replayed `clientUuid` writes nothing new.

## Non-goals

- No change of the normal comment route.
- No migration: the type column of `ticket_events` carries no check constraint
  (`specs/02-data-model.md` §4.9).
- No filter of the send view: the printout follows in WP-M14-149c.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the shared contract, the service of the internal writes, the
  routes, the integration test, this document
- Interfaces added: `INTERNAL_TICKET_EVENT_TYPES`, `isInternalTicketEvent`,
  the route `POST /api/v1/tickets/:ticketNo/comments/internal`, the action
  `internal_comment`
- Verified: `npm run check`
- Follow-up WP: WP-M14-149c (the prepared send view leaves the internal
  comments out)
- Open question: none
