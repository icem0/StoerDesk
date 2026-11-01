# WP-M2-06: Public ticket status API

format: small-model
status: implemented
depends-on: WP-M2-04b
phase: 2
context-budget: 20k tokens
spec: specs/06-report-form.md §7.3.4 (status token), §7.7 (status page), specs/02-data-model.md §4.9 (events), PLAN.md §7 (status values), §10 (`/s/<status_token>`), §15 (token entropy, no internal details)
spec-lines: 70

files-read:

- apps/api/src/tickets/report.ts (route plugin, error envelope, token helper)
- apps/api/src/tickets/**tests**/report.integration.spec.ts (test DB setup)
- apps/api/src/db/schema.ts (`tickets`, `ticketEvents`, `TICKET_STATUSES`)
- packages/shared/src/schemas/ticket.ts (report schemas, `qrTokenSchema`)
- apps/api/src/index.ts (route registration)
- specs/02-data-model.md §4.9 (event types, append-only trail)

files-write:

- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/status.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/public/tickets/:token/status` — unauthenticated; `200` with
  `PublicTicketStatus`, `404 status_token_not_found` for unknown or invalid tokens
- `PublicTicketStatus = { ticketNo, status, reportedAt, deadlineAt, events }`,
  `events = { type, at }[]`
- `getPublicTicketStatus(database, token): Promise<PublicTicketStatus>`
- `PUBLIC_TICKET_EVENT_TYPES = ['created', 'work_order_set', 'accepted',
'acknowledged', 'closed']`
- `TICKET_STATUS_VALUES` mirrors the database status check of PLAN §7

## Task

The report form of WP-M2-05 already links to `/s/<status_token>`, but nothing
answers on the API side. This package adds the read-only public status endpoint
only; the page itself is WP-M2-06b.

1. `packages/shared/src/schemas/ticket.ts`: export `TICKET_STATUS_VALUES`
   (`NEW`, `IN_REVIEW`, `WORK_ORDER_CREATED`, `OFFERED`, `ASSIGNED`, `ACCEPTED`,
   `ACKNOWLEDGED`, `CLOSED`, `CANCELLED`), `PUBLIC_TICKET_EVENT_TYPES` and the
   response schema `publicTicketStatusResponseSchema` with `ticketNo`,
   `status`, ISO `reportedAt`/`deadlineAt` and `events: { type, at }[]`.
2. `apps/api/src/tickets/status.ts`: `getPublicTicketStatus` selects the ticket
   by `status_token`; an unknown or malformed token throws
   `404 status_token_not_found`. It reads only events whose `type` is in the
   public whitelist, ordered by `created_at`, and maps them to `{ type, at }` —
   no payload, no actor, no user name, no contact, no description.
3. Same file: a `publicStatusRoutes` fastify plugin with the route above, same
   `{ code, params }` envelope as the report route.
4. `apps/api/src/index.ts`: register the plugin next to `publicReportRoutes`.
5. Test (fixture outside the file budget)
   `apps/api/src/tickets/__tests__/status.integration.spec.ts`: `200` with the
   ticket number and status, `404` for an unknown token, and a proof that
   internal events (`comment`, `declined`) and event payload/actor fields never
   reach the response.

## Non-goals

- No status page UI — **WP-M2-06b** (created in the same commit as this rewrite).
- No photos, contact data, description, event payload, actor or object contact
  fields in the public answer.
- No event types outside the whitelist; `comment` and internal state changes stay
  private.
- No rate limit (WP-M2-07), no authentication and no write route.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the three new integration tests pass against the test
database (skipped without one, like the existing report tests).

## Handoff

- Files changed: `packages/shared/src/schemas/ticket.ts`,
  `apps/api/src/tickets/status.ts` (new), `apps/api/src/index.ts`, the fixture
  `apps/api/src/tickets/__tests__/status.integration.spec.ts` and the bookkeeping
- Interfaces added: the public status endpoint, `PublicTicketStatus`,
  `PUBLIC_TICKET_EVENT_TYPES` and `TICKET_STATUS_VALUES`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npx vitest run src/tickets/__tests__/status.integration.spec.ts` (3 tests against the
  real database: no payload/actor leakage, whitelist, `404 status_token_not_found` for a
  malformed and an unknown token) and `npm run wp:check`
- Follow-up WP: `06b-status-page-ui.md` (created in the same commit as this rewrite)
- Open question: none
