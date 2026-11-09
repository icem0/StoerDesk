# WP-M2-97: internal ticket creation redirects to the ticket detail

format: small-model
status: implemented
depends-on: WP-M2-16
phase: 2
context-budget: 18k tokens
spec: PLAN.md §7 rule 1 (ticket create), WP-M2-16 (InternalCreatePage), PLAN.md §14 (internal UI)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx — submit handler redirects to /objects
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — existing create tests
- packages/shared/src/schemas/ticket.ts — InternalCreateTicketResponse
- apps/web/src/routes/index.tsx — route /tickets/:ticketNo already exists

files-write:

- work-packages/m2/97-internal-ticket-redirect-to-detail.md — this work package
- apps/web/src/features/tickets/internal-create-page.tsx — navigate to /tickets/<ticketNo> on success
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — new test for the redirect
- work-packages/README.md — Backlog table + Open follow-ups entry

interfaces:

- POST /v1/tickets answers InternalCreateTicketResponse { ticketId, ticketNo, status, statusToken, reportedAt, receivedAt, deadlineAt }; the web client now reads ticketNo and navigates to /tickets/<ticketNo> instead of /objects.
- Route /tickets/:ticketNo → TicketDetailPage is unchanged (WP-M2-18b).

## Task

1. internal-create-page.tsx: capture the response of `apiFetch('/v1/tickets', …)` as `InternalCreateTicketResponse` and call `navigate(/tickets/${created.ticketNo})` instead of `navigate('/objects')`. The "Abbrechen" button keeps navigating to /objects.
2. internal-create-page.test.tsx: add a stub answering a full InternalCreateTicketResponse on POST /v1/tickets and a stub for GET /v1/tickets/:ticketNo returning that ticketNo; assert the router lands on /tickets/<ticketNo> after a successful submit.
3. work-packages/README.md: list WP-M2-97 in the phase-2 backlog table as "done" after landing and add an Open follow-ups row ("Open question: none").

## Non-goals

- No new route, no permission change, no i18n key, no API change.
- The public report form at /m/:token is untouched (it already lands on the status page /s/<token>).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test passes; the old /objects redirect is gone.

## Handoff

- Files changed: the four files above
- Interfaces changed: none beyond the navigation target
- Follow-up WP: none
- Open question: none
