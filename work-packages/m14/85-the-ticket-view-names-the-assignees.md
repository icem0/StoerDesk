# WP-M14-85: the ticket view names the assignees

format: small-model
status: done
depends-on: WP-M14-84
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.14, specs/02-data-model.md §4.13
spec-lines: 45

files-read:

- apps/api/src/tickets/detail.ts (`getTicketDetail`, the answer of the ticket)
- packages/shared/src/schemas/ticket.ts (`TicketDetailResponse`)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the view of the ticket)
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/api/src/tickets/detail.ts
- packages/shared/src/schemas/ticket.ts
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

interfaces:

- the answer of `GET /api/v1/tickets/:ticketNo` carries `assignees` — the
  technicians of the ticket with their id and their name
- the ticket view shows the assignees of a distributed ticket

## Task

1. `packages/shared/src/schemas/ticket.ts`: the answer of the ticket detail
   carries `assignees` — a list of `{ id, name }`, empty when nobody is
   assigned.
2. `apps/api/src/tickets/detail.ts`: read the rows of `ticket_assignees` of the
   ticket with the names of their users and answer them; the list is empty for
   a ticket that was never distributed.
3. `apps/web/src/features/tickets/ticket-detail-page.tsx`: the view shows the
   assignees of the ticket (name only, no mail address and no telephone
   number) below the status — a ticket without assignees shows nothing.
4. The labels `detail.assignees.title` in `de` and `en` — the German locale
   names the row `Zuweisen`, the English locale `assigned technicians`.

## Non-goals

- No change of the workflow, of the escalation or of the administration.
- No mail address and no telephone number of a technician in the answer.
- The page test moves to the split child WP-M14-85b (the test file does not fit
  into the four-file limit of `PLAN.md` §17 with the four files above).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the ticket view names the technicians a distributed ticket
is assigned to.

## Handoff

- Files changed: the detail service, the shared contract, the ticket view, the
  two locale files
- Interfaces added: `assignees` in the answer of the ticket detail
- Verified: typecheck, ESLint, vitest (the whole suite green incl. the existing
  ticket detail specs and the e2e run), `i18n:check`, `wp:check`
- Follow-up WP: WP-M14-85b (the page test proves the assignees) — its file
  exists in this commit; afterwards the feature of the office is closed
- Open question: the per-user routing of the channels other than ntfy stays a
  named limitation of ADR-0026
