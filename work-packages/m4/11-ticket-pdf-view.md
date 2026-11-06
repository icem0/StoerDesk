# WP-M4-11: Branded PDF view for a ticket

format: small-model
status: done
depends-on: WP-M4-09b, WP-M4-10
phase: 4
context-budget: 18k tokens
spec: PLAN.md §4, §11, §14
spec-lines: 25

files-read:

- apps/web/src/routes/index.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/routes/index.tsx — add guarded route `/tickets/:ticketNo/pdf` rendering `TicketPdfPage`
- apps/web/src/features/tickets/ticket-pdf-page.tsx (new) — print-optimized ticket view with company logo + name from `/v1/settings/branding`, `@media print` hides shell/header/navigation and sizes A4, "Save as PDF" button triggers `window.print()`
- apps/web/src/i18n/locales/de/ticket.json — `pdf.*` keys
- apps/web/src/i18n/locales/en/ticket.json — `pdf.*` keys in English

interfaces:

- Web route `/tickets/:ticketNo/pdf` (requires session) — renders the ticket formatted for print/PDF with branding
- Reuses `GET /api/v1/tickets/:ticketNo` and `GET /api/v1/settings/branding`; no API change, no new permission (reuses `ticket.read`)

## Task

1. Added the guarded route `/tickets/:ticketNo/pdf` → `TicketPdfPage` to the route table.
2. `TicketPdfPage`: fetch ticket detail + branding, render a clean single-column layout (company logo top-left if configured, company name, ticket number, object, times, description, faults, photos as images, history), `@media print` hides shell/header/navigation and sets A4 margins.
3. "Save as PDF" button triggers `window.print()`; `Ctrl+P`/`Cmd+P` works too.
4. i18n keys `pdf.*` in `de` and `en`.

## Non-goals

- No server-side PDF generation (pdf-lib optional per PLAN §4); print view + `window.print()` is the PDF path.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; `/tickets/:ticketNo/pdf` renders a branded, print-optimized ticket.

## Handoff

- Files changed: `apps/web/src/routes/index.tsx`, `apps/web/src/features/tickets/ticket-pdf-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: web route `/tickets/:ticketNo/pdf` + `TicketPdfPage`
- Verified: typecheck, eslint, vitest (545 tests), i18n:check (667/667), wp:check (234/234)
- Follow-up WP: branded e-mail view (WP-M4-12), cancellation-comment overlay (WP-M4-13)
- Open question: none
