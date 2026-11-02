# WP-M2-19d: Workflow UI actions (web)

format: small-model
status: in_progress
depends-on: WP-M2-19c, WP-M2-18b
phase: 4
context-budget: 25k tokens
spec: PLAN.md §7 (ticket workflow actions), PLAN.md §14 (ticket detail actions)
spec-lines: 50

files-read:

- apps/api/src/tickets/workflow-routes.ts — POST /api/v1/tickets/:ticketNo/{review,…}
- apps/web/src/features/tickets/ticket-detail-page.tsx — existing detail page
- apps/web/src/lib/api.ts — apiFetch client

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — enable action buttons,
  wire each to the matching POST endpoint, reload ticket on success, show errors
- apps/web/src/i18n/locales/de/ticket.json — action labels and error messages
- apps/web/src/i18n/locales/en/ticket.json — action labels and error messages

interfaces:

- Action buttons in the ticket detail page are enabled and call
  `POST /api/v1/tickets/:ticketNo/{review,work-order,assign,offer,claim,accept,
  decline,acknowledge,close,reopen,cancel}`. On success the ticket is refetched
  and the page re-renders. On error an alert shows the API error code.
- Work-order prompts for type and number via `window.prompt`.
- Decline/reopen/cancel prompt for a reason via `window.prompt`.

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: replace disabled
   placeholder buttons with working ones. Show/hide based on current status
   (NEW→review; IN_REVIEW→work_order; WORK_ORDER_CREATED→assign/offer;
   OFFERED/ASSIGNED→accept/decline; ACCEPTED→acknowledge; ACKNOWLEDGED→close;
   CLOSED→reopen; any→cancel).
2. `apps/web/src/i18n/locales/{de,en}/ticket.json`: add `ticket.action.*` labels
   and `ticket.errors.*` messages.

## Non-goals

- Dialog forms with validation (window.prompt is used for now)
- Work-order type/number persistence to workflow columns (schema excludes them
  until WP-M2-19c schema update)
- Undo/redo of transitions

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green.

## Handoff

- Files changed: the three files above
- Interfaces added: workflow action buttons wired to API
- Follow-up WP: WP-M2-20 (ticket pauses and pg-boss timers, phase 6)
