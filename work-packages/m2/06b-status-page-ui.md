# WP-M2-06b: Public status page at /s/:token

format: small-model
status: planned
depends-on: WP-M2-06
phase: 2
context-budget: 24k tokens
spec: specs/06-report-form.md §7.3.4 (status link), §7.7 (status page), PLAN.md §10 (`/s/<status_token>`), §14 (mobile-first, 44 px, status not by colour alone), §16 phase 2 exit criterion
spec-lines: 75

files-read:

- apps/web/src/features/tickets/report-form-page.tsx (public page outside the shell)
- apps/web/src/routes/index.tsx (top-level public route)
- apps/web/src/lib/api.ts (`apiFetch`, `ApiError`)
- packages/shared/src/schemas/ticket.ts (`PublicTicketStatus`, status values)
- apps/web/src/i18n/locales/de/ticket.json (namespace structure)
- apps/web/src/features/tickets/**tests**/report-form-page.test.tsx (test conventions)

files-write:

- apps/web/src/features/tickets/status-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `StatusPage()` — top-level route `/s/:token`, no `Shell`, no `RequireSession`
- `usePublicStatus(token)` — `GET /v1/public/tickets/:token/status` as
  `['public-ticket-status', token]`, retry disabled
- the page renders the ticket number, a status badge with a **text** label, the
  deadline and the timeline of the public events
- `ticket:status.*` keys in `de` and `en`: `title`, `loading`, `ticketNo`,
  `deadline`, `values.<STATUS>`, `events.<type>`, `errors.invalidToken`,
  `errors.not_found`

## Task

WP-M2-06 answers the status endpoint; this package renders it for the reporter
who follows the confirmation link. It stays outside the `Shell` like `/m/:token`,
because a reporter has no session.

1. `apps/web/src/routes/index.tsx`: add `/s/:token` as a second top-level route
   next to `/m/:token`, never as a child of `App`/`RequireSession`.
2. `status-page.tsx`: parse `useParams().token` with `qrTokenSchema`. An invalid
   token renders `ticket:status.errors.invalidToken` and sends no request;
   otherwise show the loading text, the `404` notice `errors.not_found` or the
   result.
3. Render the result mobile-first (PLAN §14): the ticket number, a status badge
   that carries the label of `ticket:status.values.<status>` (status is never
   conveyed by colour alone), the formatted `deadlineAt` and a timeline over
   `events` with `ticket:status.events.<type>` and the localized date/time.
4. Add the `status` block to the `ticket` namespace in `de` and `en`; every status
   value and every public event type gets a label, so no raw enum reaches the UI.
5. Test (fixture outside the file budget)
   `apps/web/src/features/tickets/__tests__/status-page.test.tsx` with a stubbed
   `fetch`: the `de` and `en` labels, the status badge text, the timeline order,
   the `404` notice and the invalid-token case without a request.

## Non-goals

- No authentication, no internal ticket detail, no contact, description, photos
  or event payloads on the public page.
- No polling, live refresh or push updates.
- No change to the report form or its confirmation link (WP-M2-05).
- No Playwright flow — the phase 2 closing package **WP-M2-10** drives the whole
  QR path; this package proves the page with unit tests.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new web tests fail before the page exists and pass after
it; `i18n:check` reports the new `ticket:status.*` keys in both locales.

## Handoff

- Files changed: `apps/web/src/features/tickets/status-page.tsx` (new),
  `apps/web/src/routes/index.tsx`, the `ticket` locale files (de/en), the fixture
  `apps/web/src/features/tickets/__tests__/status-page.test.tsx` and the bookkeeping
- Interfaces added: `StatusPage`, `usePublicStatus(token)`, `ticket:status.*`
- Verified: see the handoff of the implementation commit
- Follow-up WP: none — the phase 2 exit-criterion E2E is the existing WP-M2-10
- Open question: none
