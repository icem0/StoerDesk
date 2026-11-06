# WP-M4-12: Branded E-Mail view for a ticket

format: small-model
status: done
depends-on: WP-M4-09b, WP-M4-10
phase: 4
context-budget: 18k tokens
spec: PLAN.md §4, §14
spec-lines: 20

files-read:

- apps/web/src/routes/index.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/routes/index.tsx — add guarded route `/tickets/:ticketNo/email` rendering `TicketEmailPage`
- apps/web/src/features/tickets/ticket-email-page.tsx (new) — branded ticket preview for e-mail (company logo + name, ticket fields, photos) plus a prefilled `mailto:` link; "Write e-mail" button opens the user's mail client
- apps/web/src/i18n/locales/de/ticket.json — `email.*` keys
- apps/web/src/i18n/locales/en/ticket.json — `email.*` keys in English

interfaces:

- Web route `/tickets/:ticketNo/email` (requires session) — renders a branded e-mail preview and opens a `mailto:` link
- Reuses `GET /api/v1/tickets/:ticketNo` and `GET /api/v1/settings/branding`; no API change, no new permission (reuses `ticket.read`)

## Task

1. Added the guarded route `/tickets/:ticketNo/email` → `TicketEmailPage` to the route table.
2. `TicketEmailPage`: fetch ticket detail + branding, render a branded preview (logo/company name, ticket number, object, status, priority, times, description, faults, photos as thumbnails), plus a `mailto:` link whose body carries ticket number, object, description and the deep link to the ticket detail page; a button opens the mail client.
3. i18n keys `email.*` in `de` and `en` (ticket namespace).

## Non-goals

- No server-side SMTP send from this page; it is a client mailto preview.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; `/tickets/:ticketNo/email` renders a branded preview with a working mailto link.

## Handoff

- Files changed: `apps/web/src/routes/index.tsx`, `apps/web/src/features/tickets/ticket-email-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: web route `/tickets/:ticketNo/email` + `TicketEmailPage`
- Verified: typecheck, eslint, vitest (545 tests), i18n:check (685/685), wp:check (234/234)
- Follow-up WP: cancellation-comment overlay (WP-M4-13)
- Open question: none
