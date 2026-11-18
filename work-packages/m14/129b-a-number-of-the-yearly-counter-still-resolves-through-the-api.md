# WP-M14-129b: a number of the yearly counter still resolves through the API

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/02-data-model.md §4.11 (ADR-0027), specs/06-report-form.md §7.3.2; PLAN.md §15 (SEC-015)
spec-lines: 30

depends-on: WP-M14-129a, WP-M10-16

files-read:

- apps/api/src/tickets/detail.ts (the `:ticketNo` entry point)
- apps/api/src/tickets/internal.ts (the comment route)
- apps/api/src/tickets/external.ts (the work-order route)
- apps/api/src/privacy/routes.ts (the export and erase routes)
- packages/shared/src/schemas/ticket.ts (`ticketNoSchema`)
- apps/api/src/tickets/__tests__/workflow-work-order.integration.spec.ts (the test style)

files-write:

- apps/api/src/tickets/__tests__/legacy-ticket-no.integration.spec.ts

interfaces:

- `GET /api/v1/tickets/:ticketNo` — answers a ticket whose number was allocated
  before ADR-0027 (`ST-2026-0001`)
- `POST /api/v1/tickets/:ticketNo/comments` — the same for a ticket of the old
  shape
- `PATCH /api/v1/tickets/:ticketNo/work-order` — the same for the external route

## Task

ADR-0027 decision 4 and 5 — the proof that the migration breaks no link.

1. `apps/api/src/tickets/__tests__/legacy-ticket-no.integration.spec.ts`: write
   a ticket with the number of the yearly counter (`ST-2026-0001`) directly into
   the database and prove that the API still answers it — the detail route, the
   comment route of the internal user and the work-order route of the external
   API each answer `200` and never `400 invalid_request`.
2. Prove the same for the public status path: the status page of a ticket uses
   its `status_token`, not its number, and stays untouched.
3. The test writes only mock numbers, no contact data.

## Non-goals

- No product code: the routes already call `ticketNoSchema`, and WP-M14-129a
  widened it for both shapes.
- No migration, no contract change, no i18n, no UI.
- No renumbering of an existing ticket — a number is never rewritten.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: green. Without a reachable PostgreSQL the integration spec is skipped
and reports **unverified** (`PLAN.md` §18).

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-129c (a malformed number is still rejected)
- Open question: none
