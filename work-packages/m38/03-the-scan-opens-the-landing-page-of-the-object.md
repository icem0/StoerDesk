# WP-M38-03: the scan opens the landing page of the object

format: ctx-256k
status: done
depends-on: WP-M38-02
phase: 38
milestone: m38
context-budget: 46k tokens
spec: specs/06-report-form.md §7.10.1, §7.10.2; PLAN.md §10
spec-lines: 60
changed-lines: 480

files-read:

- specs/06-report-form.md §7.2, §7.8, §7.10 (the fields, the duplicate hint, the way of the code)
- apps/web/src/features/tickets/report-form-page.tsx (the page of the form, its hooks)
- apps/web/src/features/tickets/object-ticket-page.tsx (the page of the view)
- apps/web/src/routes/index.tsx (the addresses of the app)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the report)
- packages/shared/src/schemas/ticket.ts (the contracts of the public paths)

files-write:

- apps/web/src/features/tickets/qr-landing-page.tsx (the landing page of the object)
- apps/web/src/features/tickets/report-form-page.tsx (the form keeps its behaviour, the address changes)
- apps/web/src/routes/index.tsx (the addresses `/m/:token`, `/m/:token/neu`)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the landing page)
- apps/web/src/i18n/locales/en/ticket.json (the texts of the landing page)
- apps/web/src/features/tickets/__tests__/qr-landing-page.test.tsx
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx

interfaces:

- `/m/:token` — the landing page of the object: the open tickets first, the report one tap away
- `/m/:token/neu` — the report form
- `report.landing.*` — the texts of the landing page: the heading, the hint, the buttons, the empty notice

## Task

The scan of a code opens the report form today. The reporter of a fault that is
not gone scans the code a second time and has to read a notice in the form to
find the ticket that is already open. ADR-0061 decides that the scan opens the
**landing page** of the object and that the form moves to `/m/:token/neu`.

1. `apps/web/src/features/tickets/qr-landing-page.tsx`: the page resolves the
   token (`GET /api/v1/public/qr/:token`) and reads the open tickets of the
   object (`GET /api/v1/public/tickets/open?qrToken=`). With an open ticket
   the page shows the object and the open tickets — the **newest** one first,
   as the main card — and offers „Ticket öffnen“ (the view of WP-M38-02) and
   „Neue Meldung“ (`/m/:token/neu`). Without an open ticket it offers the
   report directly. The page carries no form, no contact field and no photo.
2. `apps/web/src/features/tickets/report-form-page.tsx`: the behaviour of the
   form stays as it is (the duplicate hint of §7.8, the spam protection of
   §7.6, the offline outbox, the confirmation); only its address changes.
3. `apps/web/src/routes/index.tsx`: `/m/:token` carries the landing page,
   `/m/:token/neu` the form. Both lie outside the shell — a reporter never
   sees the login form.
4. The texts of the landing page live in the namespace `ticket`
   (`report.landing.*`) in `de` and `en`.
5. The tests: the landing page shows the open tickets of the object and the
   button to a new report, shows the report directly without an open ticket
   and answers an unknown token; the form still works under its new address.

## Non-goals

- No change of the duplicate hint inside the form (§7.8).
- No registration of the customer here — that is §19.6 of the portal.
- No photo, no contact field and no form on the landing page.

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

- Files changed: the landing page, the form, the addresses, the two locales
  and the two test files
- Interfaces added: the two addresses and the texts `report.landing.*`
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm run wp:check` and the web tests of the landing page and of the form are green; the E2E of the report path needs a running stack and is **unverified** in this environment (no database, no Docker daemon)
- Follow-up WP: WP-M38-04 (the landing page of the customer)
- Open question: none
