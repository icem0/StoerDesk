# WP-M9-21: ticket list rows with the timeline in the middle

format: small-model
status: done
depends-on: WP-M9-20
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §9, §14; specs/05-timeline.md §5.4
spec-lines: 60

files-read:

- PLAN.md (§9 timeline, §14 user interface)
- specs/05-timeline.md (§5.4 mini timeline in the list)
- apps/web/src/features/tickets/ticket-list-page.tsx (the card list)
- apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx (the list test)
- apps/web/src/features/dashboard/start-page.tsx (the tile link style)
- apps/web/src/i18n/locales/de/ticket.json (list labels)

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `TicketRow` — one ticket per line: ticket number and object on the left, the mini timeline in the middle, status, priority and times on the right
- the whole line is one link to `/tickets/:ticketNo`

## Task

1. Replace the card grid of the list with one line per ticket. The line shows
   the ticket number, the object name and number, the mini timeline with the
   remaining or overdue time in the middle, the status, the priority and the
   reported time around it.
2. Make the whole line one link to the ticket detail; the ticket number is no
   longer a link of its own and the "Anzeigen" link of the card is gone.
3. Ask the API for the deadline order of WP-M9-20
   (`order=deadlineAt&direction=asc`), so the nearest deadline is on top.
4. Keep the list usable on a phone: below `md` the line stacks, the timeline
   takes the full width, and the touch target stays at least 44 px high.
5. Update the list test: the row is one link, the timeline and the remaining
   time are in it, and the status and the priority are still localized.

## Non-goals

- No sort selector, no new column and no new API field.
- No change of the filters, the search or the pagination.
- No change of the ticket detail page.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the list shows one line per ticket, every line is a link to
the detail, and the rows arrive in the deadline order.

## Handoff

- Files changed: the ticket list page, both ticket locale files, the list test
- Interfaces added: none
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: none
- Open question: none
