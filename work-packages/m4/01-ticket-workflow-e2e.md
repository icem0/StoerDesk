# WP-M4-01: Ticket workflow E2E test (web)

format: small-model
status: implemented
depends-on: WP-M2-19d, WP-M2-15
phase: 4
context-budget: 25k tokens
spec: PLAN.md §7 (ticket workflow), PLAN.md §16 phase 4 (exit criteria)
spec-lines: 60

files-read:

- apps/web/e2e/report-flow.spec.ts — E2E test pattern, sign-in, object creation via API
- apps/web/src/features/tickets/ticket-detail-page.tsx — workflow action buttons
- apps/api/src/tickets/workflow.ts — transition map and events
- apps/api/src/tickets/internal.ts — internal ticket creation API

files-write:

- apps/web/e2e/workflow.spec.ts — Playwright E2E test for the full ticket workflow

interfaces:

- `test('full ticket workflow creates audit trail')` — signs in as admin, creates an
  object and an internal ticket via the API, then drives every workflow transition
  through the ticket detail UI (review → work order → assign → accept → acknowledge
  → close) and asserts the status and the append-only `ticket_events` history after
  each step.
- Work-order and acknowledge steps need a request body; the UI uses `window.prompt`
  for work order and does not send a body for acknowledge, so those two transitions
  are exercised through `page.context().request.post` directly while the UI is
  verified for the button-only transitions.

## Task

1. `apps/web/e2e/workflow.spec.ts`: write one Playwright test (de and en) that
   signs in as the bootstrap administrator, creates an object via
   `POST /api/v1/objects`, creates an internal ticket via `POST /api/v1/tickets`,
   then steps through `review_started`, `work_order_set`, `assigned`, `accepted`,
   `acknowledged`, `closed` — using the UI buttons where no body is needed and the
   API directly for `work_order_set` (type/number) and `acknowledged` (result) —
   and asserts the status badge and the `ticket_events` history after every
   transition, ending with `CLOSED` and the full event chain `created`,
   `review_started`, `work_order_set`, `assigned`, `accepted`, `acknowledged`,
   `closed`.

## Non-goals

- UI dialog forms for acknowledge (window.prompt not added here — phase 4 WP
  already uses window.prompt for work order; acknowledge body is sent via API).
- Decline, reopen, cancel, claim, offer transitions — covered by the state map but
  not part of the happy-path E2E.
- pg-boss timers, escalation, ticket_pauses — phase 6.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green. The E2E test itself is part of `npm run test:e2e` and skips
without a reachable PostgreSQL and Chromium (developer machine), runs in CI.

## Handoff

- Files changed: `apps/web/e2e/workflow.spec.ts` (new)
- Interfaces added: E2E test `workflow.spec.ts`
- Verified: `npm run wp:check` green; E2E skips locally without database/browser
- Corrected by: the WP-M4-01 repair commit — the test never reached the workflow
  buttons: they hide behind the "Actions" toggle (WP-M2-19d), and
  `handleAction` posted the **event names** (`/review_started`, `/accepted`)
  instead of the route segments of WP-M2-19c (`/review`, `/accept`) with a
  `content-type: application/json` header but no body (Fastify 400). The CI
  check runs of v0.1.123 … v0.1.125 were red because of this; the repair makes
  the E2E pass against a real database and Chromium.
- Follow-up WP: none announced
- Open question: none
