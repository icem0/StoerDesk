# WP-M14-129b: the contract knows the year-free ticket number

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/02-data-model.md §4.11 (ADR-0027), specs/06-report-form.md §7.3.2; PLAN.md §15 (SEC-015), §17
spec-lines: 30

depends-on: WP-M14-129a, WP-M9-29

files-read:

- packages/shared/src/schemas/ticket.ts (`ticketNoSchema`)
- apps/api/src/db/migrations/0048_ticket_no_counter_global.sql (`next_ticket_no()`)
- apps/api/src/tickets/detail.ts (the format guard before the lookup)
- apps/api/src/privacy/routes.ts (the second user of `ticketNoSchema`)
- docs/SECURITY-PLAN.md (the audit area C rule)
- packages/shared/src/__tests__/dashboardStats.test.ts (the test style)

files-write:

- packages/shared/src/schemas/ticket.ts
- packages/shared/src/__tests__/ticketNo.test.ts
- docs/SECURITY-PLAN.md (the repeat-pass line of this diff)

interfaces:

- `ticketNoSchema` — `z.string().trim().regex(/^ST-(\d{4,}|\d{4}-\d{4,})$/)`:
  the year-free `ST-0001` of ADR-0027 **or** the legacy `ST-2026-0001`
- `TicketNoFormat` error code stays `invalid_request` with `fields: ['ticketNo']`

## Task

ADR-0027 decision 5 — the shared contract only.

1. `packages/shared/src/schemas/ticket.ts`: replace the regex of `ticketNoSchema`
   with the alternation above and update its JSDoc: `ST-0001` (§4.11, ADR-0027),
   the `ST-2026-0001` shape of migration `0004` stays accepted because numbers
   are never rewritten.
2. `packages/shared/src/__tests__/ticketNo.test.ts`: the new shape parses
   (`ST-0001`, `ST-0121`, `ST-10000`), the legacy shape parses
   (`ST-2026-0001`, `ST-9999-9999`), and a malformed value is rejected
   (`ST-1`, `st-0001`, `ST-2026-26-1`, `ST-00000-00000-00000`, `''`).
3. `docs/SECURITY-PLAN.md`: add the repeat-pass line for this diff — areas A and B
   re-checked in full (no route, capability or scope change), area C for
   `ticket.ts`: the path parameter is still format-validated before the lookup at
   every `:ticketNo` entry point, both accepted shapes are bounded, the guard
   answers `400 invalid_request` with the field path and never reaches the
   database, and the widened legacy alternative adds no capability. No new
   finding.

## Non-goals

- No route change: every `:ticketNo` guard already calls `ticketNoSchema`
  (WP-M9-29, WP-M9-30, WP-M10-08, WP-M10-16) and inherits the new rule.
- No migration, no service, no UI, no i18n.
- No change of `dashboard.ts`, `privacy.ts` or `outbox.ts` — they reference
  `ticketNoSchema`, they do not restate it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run check
```

Expected: green; the new test fails before the change and passes after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-129c (the tests follow the year-free number)
- Open question: none
