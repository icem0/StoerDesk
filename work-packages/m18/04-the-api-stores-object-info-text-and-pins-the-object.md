# WP-M18-04: the API stores `object_info_text` and pins the object in the list

format: small-model
status: done
depends-on: WP-M18-03
phase: 18
milestone: m18
context-budget: 20k tokens
spec: ADR-0042; PLAN.md §6, §7; specs/02-data-model.md §4.3.3, §4.8
spec-lines: 40

files-read:

- docs/DECISIONS/0042-a-ticket-without-an-object-is-possible.md (ADR-0042)
- packages/shared/src/schemas/ticket.ts (internal contract, detail response)
- packages/shared/src/schemas/object.ts (object summary)
- apps/api/src/tickets/internal.ts (internal creation insert)
- apps/api/src/tickets/detail.ts (ticket detail select)

files-write:

- packages/shared/src/schemas/ticket.ts, packages/shared/src/schemas/object.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/detail.ts
- CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `internalCreateTicketRequestSchema.objectInfo?: string` — free text about the object of a ticket without an object (max. 4000 characters).
- `objectSummarySchema.pinned: boolean` — the object list marks the reserved row and sorts it last.
- `ticketDetailResponseSchema.ticket.objectInfoText?: string | null` — shown on the ticket view (WP-M18-05).
- `POST /api/v1/tickets` stores `object_info_text`; `GET /api/v1/tickets/:ticketNo` answers it.

## Task

1. packages/shared/src/schemas/ticket.ts — `objectInfo` on
   `internalCreateTicketRequestSchema` (after `description`); `objectInfoText`
   on `ticketDetailResponseSchema` (after `description`).
2. packages/shared/src/schemas/object.ts — `pinned: boolean` on
   `objectSummarySchema`.
3. apps/api/src/tickets/internal.ts — `object_info_text: input.objectInfo ?? null`
   on the insert of `tickets`.
4. apps/api/src/tickets/detail.ts — `objectInfoText: tickets.objectInfoText` in
   the detail select.
5. CHANGELOG.md ### Added and work-packages/README.md: WP-M18-04 becomes `done`.

## Non-goals

- The UI (picker entry, info field, detail row) — WP-M18-05.
- The guards (no QR, no sticker, no import, no deletion of the reserved object) — WP-M18-06.
- The statistics filter `withoutObject` — WP-M18-07.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; database integration tests are unverifiable locally
(the dev database of this container is not fully migrated — see WP-M18-03).

## Handoff

- Files changed: packages/shared/src/schemas/ticket.ts,
  packages/shared/src/schemas/object.ts, apps/api/src/tickets/internal.ts,
  apps/api/src/tickets/detail.ts, CHANGELOG.md,
  work-packages/README.md, this document
- Interfaces added: `objectInfo`, `pinned`, `objectInfoText`
- Follow-up WP: WP-M18-05 (the internal form offers „Ohne Objekt" and the object info field)
- Open question: none
