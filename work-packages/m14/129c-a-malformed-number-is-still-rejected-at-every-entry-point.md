# WP-M14-129c: a malformed number is still rejected at every entry point

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/02-data-model.md §4.11 (ADR-0027); PLAN.md §15 (audit — SEC-015), §17
spec-lines: 30

depends-on: WP-M14-129b, WP-M9-29

files-read:

- apps/api/src/tickets/detail.ts (the format guard before the lookup)
- apps/api/src/tickets/internal.ts (the comment route)
- apps/api/src/tickets/external.ts (the work-order route)
- apps/api/src/tickets/delete-routes.ts (the delete route)
- apps/api/src/tickets/duplicates.ts (the public comment route)
- packages/shared/src/schemas/ticket.ts (`ticketNoSchema`)

files-write:

- apps/api/src/tickets/__tests__/ticket-no-guard.integration.spec.ts

interfaces:

- `GET /api/v1/tickets/:ticketNo` — `400 invalid_request` with
  `fields: ['ticketNo']` for a malformed number, before any lookup
- the same guard on the comment, work-order, delete and public comment routes

## Task

The widening of `ticketNoSchema` in WP-M14-129a must not weaken the guard of
SEC-015: a malformed number never reaches the database.

1. `apps/api/src/tickets/__tests__/ticket-no-guard.integration.spec.ts`: every
   `:ticketNo` entry point answers `400 invalid_request` with
   `fields: ['ticketNo']` for a malformed number (`st-0001`, `ST-1`,
   `ST-2026-26-1`, a path traversal attempt) and never a `404` or a `500`.
2. The same routes answer `200` for both accepted shapes — the year-free
   `ST-0001` and the legacy `ST-2026-0001` (the legacy case is proved by
   WP-M14-129b) — so the guard filters exactly the malformed numbers.
3. The test writes only mock numbers and mock users, no contact data.

## Non-goals

- No product code: the guard is the `ticketNoSchema` of WP-M14-129a, every
  route already calls it before the lookup.
- No migration, no i18n, no UI.

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

- Files changed: `apps/api/src/tickets/__tests__/ticket-no-guard.integration.spec.ts`
  and this file (plus the bookkeeping: the changelog, `PLAN.md` §16, the backlog
  table)
- Interfaces added: none — the proof only
- Verified: the new integration spec ran against the test database (6/6, no
  skip): the detail route, the comment route of the internal user, the review
  step of the workflow, the external work-order route and the delete route
  answer `400 invalid_request` with `fields: ['ticketNo']` for every malformed
  number (`st-0001`, `ST-1`, `ST-2026-26-1`, a percent-encoded path traversal
  and an injection attempt), while the year-free `ST-0001` reaches the lookup;
  `npm run check` green
- Follow-up WP: none — the year-free ticket number is closed with
  WP-M14-129a … WP-M14-129c
- Open question: none
