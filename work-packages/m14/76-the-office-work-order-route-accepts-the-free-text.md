# WP-M14-76: The office work-order route accepts the free text

format: small-model
status: done
depends-on: WP-M14-43
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/08-objects-api.md §9.3 (the work-order body), PLAN.md §7 rule 3
spec-lines: 20

files-read:

- apps/api/src/tickets/workflow-routes.ts (the office route of the work order)
- packages/shared/src/schemas/ticket.ts (`workOrderRequestSchema`)
- apps/api/src/tickets/external.ts (the external route of the work order)
- apps/api/src/tickets/workflow.ts (`work_order_set` writes `payload.text`)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the body the office view sends)

files-write:

- apps/api/src/tickets/workflow-routes.ts
- specs/08-objects-api.md (§9.3 — the body of the work-order update)
- work-packages/m14/76-the-office-work-order-route-accepts-the-free-text.md (this document)
- work-packages/README.md (the backlog row and the status prose)

interfaces:

- `POST /api/v1/tickets/:ticketNo/work-order` — the body `{ text }` (`workOrderRequestSchema` of `@stoerdesk/shared`), a malformed body answers `400 invalid_request`

## Task

1. The office reaches the stage "Auftrag angelegt" through the stage selection of
   the ticket view (`specs/07-escalation.md` §7.10). The view sends
   `{ text: <Arbeitsauftrag> }` — the free text field of WP-M14-43 — but the
   office route still validated the body against its own schema
   `WORK_ORDER = { type, number }` of WP-M2-19c. Every work order of the office
   therefore answered `400 invalid_request`, and the ticket view answered the
   generic "Die Aktion konnte nicht ausgeführt werden." (the error code has no
   translation in `detail.errors`).
2. `apps/api/src/tickets/workflow-routes.ts`: delete the local `WORK_ORDER`
   schema and use the shared `workOrderRequestSchema` — the same contract as the
   external route (`PATCH /api/v1/tickets/:ticketNo/work-order`,
   `apps/api/src/tickets/external.ts`) and as `transitionTicket()`, which writes
   `payload.text` into `tickets.work_order_text` (WP-M14-42).
3. `specs/08-objects-api.md` §9.3: the body of the work-order update is `{ text }`,
   not `{ type, number }` — the row of the external API described the old
   contract.

## Non-goals

- No change of the free text field itself: the column `tickets.work_order_text`,
  the shared schema and the view stay as they are (WP-M14-42, WP-M14-43).
- No new error message in the ticket view — the generic text is repaired by
  WP-M14-77.
- No change of the external route, of the stage chain or of the workflow engine.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new integration spec fails before the change and passes
after it.

## Handoff

- Files changed: `apps/api/src/tickets/workflow-routes.ts`, `specs/08-objects-api.md`,
  this document, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: none — the body of the office route becomes the shared one
- Verified: `npm run check` green (typecheck, lint, 195 files and 1304 tests, E2E
  14 tests); the new integration spec fails before the change (the free text
  answered `400`, the old body answered `200`) and passes after it; the work
  order step of the E2E runs through the UI again, so the office path is proven
- Follow-up WP: WP-M14-77 (the ticket view names the reason of a failed action)
- Open question: none
