# WP-M10-16: Personal-data export and erasure routes

format: small-model
status: planned
depends-on: WP-M10-15
phase: 10
milestone: m10
context-budget: 18k tokens
spec: specs/14-nfr.md §15.2; docs/DECISIONS/0014-privacy-retention-and-restore-drill.md
spec-lines: 80

files-read:

- specs/14-nfr.md (§15.2)
- apps/api/src/tickets/detail.ts
- apps/api/src/tickets/delete-routes.ts
- apps/api/src/db/schema.ts

files-write:

- apps/api/src/privacy/routes.ts
- packages/shared/src/schemas/privacy.ts
- apps/api/src/index.ts
- packages/shared/src/schemas/index.ts

interfaces:

- `GET /api/v1/privacy/tickets/:ticketNo/export`
- `POST /api/v1/privacy/tickets/:ticketNo/erase`

## Task

1. Add the export route under `user.write` returning reporter contact, photos
   and events without status token or internal notes.
2. Add the erasure route with a 5–1000 character reason; it nulls the contact
   fields and appends one `personal_data_erased` event.
3. Make erasure idempotent and never delete the ticket.
4. Add the shared schemas and tests for permission, export shape, first and
   repeated erasure.

## Non-goals

- No bulk export.
- No ticket deletion.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the audit event is append-only and a repeat does not add a
second event.

## Handoff

- Files changed: the privacy routes, the shared contracts and the server
  registration
- Interfaces added: export and erasure endpoints
- Verified: the commands above
- Follow-up WP: WP-M10-17
- Open question: none
