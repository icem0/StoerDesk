# WP-M9-29: ticket number validated at the entry points

format: small-model
status: done
depends-on: WP-M9-28
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §15 (audit — SEC-015); specs/02-data-model.md §4.11 (`ticket_no` format `ST-<year>-<counter>`)
spec-lines: 30

files-read:

- packages/shared/src/schemas/ticket.ts (`trimmedText`, internal create schema)
- apps/api/src/tickets/detail.ts (GET /api/v1/tickets/:ticketNo)
- apps/api/src/tickets/internal.ts (comment route)
- apps/api/src/tickets/duplicates.ts (public comment route)

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/duplicates.ts

interfaces:

- `ticketNoSchema` — `z.string().trim().regex(/^ST-\d{4}-\d{4,}$/)`; validated at every `tickets/:ticketNo` entry point before the lookup (detail, internal comment, public comment; workflow, delete in WP-M9-30)

## Task

1. `packages/shared/src/schemas/ticket.ts`: add `ticketNoSchema` —
   `z.string().trim().regex(/^ST-\d{4}-\d{4,}$/)` (matching `next_ticket_no()`,
   `ST-<year>-<counter>` with four-digit counter padding).
2. `apps/api/src/tickets/detail.ts`: answer `400 invalid_request` with
   `fields: ['ticketNo']` when the path parameter does not match, before
   resolving the ticket.
3. `apps/api/src/tickets/internal.ts`: same guard on the comment route.
4. `apps/api/src/tickets/duplicates.ts`: same guard on the public comment
   route (the QR token is already the capability there — an invalid ticket
   number never reaches the object lookup).

## Non-goals

- No migration, no schema change, no i18n change, no UI change.
- No change of the workflow/delete routes (WP-M9-30).

## Acceptance

```bash
npm run check
```

Expected: green.

## Handoff

- Files changed: the shared schema and the three route files
- Interfaces added: `ticketNoSchema`
- Verified: `npm run check`
- Follow-up WP: WP-M9-30 (ticketNo on workflow/delete/photo routes, decline guard,
  photo guard, reason length, path containment, SEC-007/008/015/017/018/020)
- Open question: none
