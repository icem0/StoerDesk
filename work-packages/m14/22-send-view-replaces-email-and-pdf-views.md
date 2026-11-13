# WP-M14-22: The send view replaces the e-mail and the pdf views

format: small-model
status: done
depends-on: WP-M12-09, WP-M4-11, WP-M4-12
phase: 14
milestone: m14
context-budget: 28k tokens
spec: PLAN.md §4, §11, §14 (branded printable/exported ticket views)
spec-lines: 40

files-read:

- apps/web/src/features/tickets/ticket-pdf-page.tsx
- apps/web/src/features/tickets/ticket-email-page.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-header-actions.test.tsx

files-write:

- apps/web/src/features/tickets/ticket-send-page.tsx (new; the former ticket-email-page.tsx and ticket-pdf-page.tsx are deleted in this WP)
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `TicketSendPage` — the prepared send view at `/tickets/:ticketNo/send`
- the send button of the ticket detail header

## Task

1. The header icon button of the ticket detail becomes a paper plane: label
   `detail.menu.send` ("Versenden" / "Send"), `data-testid="ticket-send-button"`,
   and it opens the prepared view at `/tickets/:ticketNo/send` instead of the
   e-mail view.
2. The prepared view shows the branded ticket (logo, company, ticket number),
   the ticket fields, title/description/faults, the photos and **all** history
   events — date, label, actor and the event text. Nothing is truncated.
3. Two buttons sit on top of the content: "Als PDF speichern" (`pdf.save`,
   `window.print()`) and "E-Mail versenden" (`email.write`, a prefilled
   `mailto:` link with subject and body from `email.subject`/`email.body*`
   plus the deep link to the ticket detail).
4. The print output is A4 (`@page`), the buttons and the shell are
   `print:hidden` and every block — each history row, each photo, each field
   section — carries `print:break-inside-avoid`, so no event and no photo is
   cut at a page break; photos load eagerly so they are in the printout.
5. The texts `detail.menu.send` and the repaired `email.write` are added in
   `de` and `en`; the keys of the removed views (`detail.menu.email`,
   `email.title`, `email.object` … `email.source`) leave both locales.

## Non-goals

- No API route, no database change, no messenger channel — the user's e-mail
  client and the browser print dialog stay the only sending paths.
- No share link, no server-side PDF rendering.
- The escalation section and the cancel button of the header stay unchanged.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the header test drives the send button to the prepared
view; the prepared view offers both buttons on top with full history and
photos.

## Handoff

- Files changed: the new send view, the detail header, the route table, the
  locales and the header test; the e-mail and the pdf view are deleted
- Interfaces added: `TicketSendPage`, the route `/tickets/:ticketNo/send`
- Verified: `npm run check`
- Follow-up WP: none
- Open question: none
