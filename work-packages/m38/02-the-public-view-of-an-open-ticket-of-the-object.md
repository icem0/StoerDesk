# WP-M38-02: the public view of an open ticket of the object

format: ctx-256k
status: done
depends-on: WP-M38-01
phase: 38
milestone: m38
context-budget: 52k tokens
spec: specs/06-report-form.md §7.10.3, §7.10.4; PLAN.md §10
spec-lines: 90
changed-lines: 620

files-read:

- specs/06-report-form.md §7.8, §7.10 (the duplicate hint, the way of the code)
- apps/api/src/tickets/duplicates.ts (the open tickets, the public comment, the spam limit)
- apps/api/src/tickets/status.ts (the public status and its events)
- apps/api/src/tickets/spam.ts (the report attempt and the suspicion)
- apps/api/src/db/schema.ts (`ticket_events`, `internal_action_receipts`)
- packages/shared/src/schemas/ticket.ts (the public contracts)
- apps/web/src/features/tickets/status-page.tsx (the page of `/s/:token`)
- apps/web/src/routes/index.tsx (the addresses of the app)

files-write:

- packages/shared/src/schemas/ticket.ts (the contracts of the view and of the comment)
- apps/api/src/tickets/object-ticket.ts (the service and the routes)
- apps/api/src/index.ts (the registration of the routes)
- apps/api/src/tickets/__tests__/object-ticket.integration.spec.ts
- apps/web/src/features/tickets/object-ticket-page.tsx (the page of the view)
- apps/web/src/routes/index.tsx (the address `/m/:token/tickets/:ticketNo`)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the page)
- apps/web/src/i18n/locales/en/ticket.json (the texts of the page)
- apps/web/src/features/tickets/__tests__/object-ticket-page.test.tsx

interfaces:

- `publicObjectTicketSchema` — the public view of a ticket of the object: `ticketNo`, `status`, `reportedAt`, `deadlineAt`, `events`, `comments`
- `publicObjectCommentRequestSchema` — the body of the comment of the object: `qrToken`, `clientUuid`, `text`, `faultTemplateKeys`, `contact`, `locale`
- `readObjectTicket(database, { qrToken, ticketNo })` — the public view of an open ticket of the object
- `addObjectComment(database, input, context)` — the append-only comment of the object
- `GET /api/v1/public/objects/:token/tickets/:ticketNo` — the public view (no authentication)
- `POST /api/v1/public/objects/:token/tickets/:ticketNo/comments` — the comment of the object (no authentication)

## Task

The scanner of a code has no answer today: the open tickets of an object are a
list with the number, the status and the time (§7.8.1), and the only public
view of a ticket needs the `status_token` of its reporter (§7.3.4). ADR-0061
decides that the QR token of the object is the capability of a **narrow** view
and of a comment on an open ticket of that object.

1. `packages/shared/src/schemas/ticket.ts`: `publicObjectTicketSchema` carries
   the number, the status, the reported time, the deadline, the public events
   (`publicTicketEventSchema`) and the public comments (`{ at, text }`).
   `publicObjectCommentRequestSchema` is the body of the comment — the
   `status_token` of §7.8.2 is **not** part of it.
2. `apps/api/src/tickets/object-ticket.ts`: `readObjectTicket` resolves the
   object by the token (an **active** object, as in §7.8.1), takes the ticket
   of that object and requires that it is still open — a closed ticket answers
   `404 ticket_not_found`, so a caller cannot learn that a closed ticket of
   the object exists. The answer carries the public events of the status and
   the public comments (`type = 'comment'`), **without** the contact of the
   author. `addObjectComment` writes one append-only `ticket_events` row with
   `actor_kind = 'public'` and `payload.source = 'object_qr'`, is idempotent
   over the `client_uuid` and counts the attempt in the spam limit of §7.6.
3. `apps/api/src/index.ts`: the routes of the module are registered next to the
   other public routes.
4. `apps/web/src/features/tickets/object-ticket-page.tsx`: the page shows the
   number, the status, the times, the events and the comments of the ticket
   and carries the field of the comment. The comment is sent to the route of
   the object and the answer is shown like the confirmation of the report.
5. `apps/web/src/routes/index.tsx`: the address `/m/:token/tickets/:ticketNo`
   lies outside the shell, next to the other public addresses.
6. The texts of the page live in the namespace `ticket` (`report.object.*`) in
   `de` and `en`.
7. The tests: the API answers the view of an open ticket, refuses a closed
   one, a foreign one and an unknown one, writes the comment and keeps the
   idempotency; the page shows the ticket and sends the comment.

## Non-goals

- No landing page of the object — that is WP-M38-03.
- No change of the path of §7.8.2 (`status_token`): SEC-004 stays.
- No description, no contact and no photo of another reporter in the answer.
- No internal event in the answer (ADR-0034, ADR-0038).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: the two contracts, the module of the API, its registration,
  the page, the address, the two locales and the two test files
- Interfaces added: `publicObjectTicketSchema`,
  `publicObjectCommentRequestSchema`, `readObjectTicket`, `addObjectComment`,
  the two public routes
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm run wp:check` and the web test of the page are green; the integration test of the API needs a PostgreSQL and is **unverified** in this environment (no database, no Docker daemon)
- Follow-up WP: WP-M38-03 (the scan opens the landing page of the object)
- Open question: none
