# WP-M2-08: Duplicate hint in the public report form

format: small-model
status: implemented
depends-on: WP-M2-05, WP-M2-04b
phase: 2
context-budget: 26k tokens
spec: specs/06-report-form.md §7.2 (fields), §7.3 (create endpoint), §7.8 (duplicate hint — filled by this package), PLAN.md §10 (duplicate hint bullet), §14 (mobile-first form), §3 (error contract)
spec-lines: 75

files-read:

- apps/api/src/tickets/report.ts (the create path, the error class, the spam hooks)
- apps/api/src/tickets/status.ts (the public route pattern and the token capability)
- apps/api/src/db/schema.ts (`tickets`, `ticket_events`, `tickets.parent_ticket_id`)
- apps/web/src/features/tickets/report-form-page.tsx (the public form and its submit flow)
- packages/shared/src/schemas/ticket.ts (the shared request/response schemas)
- apps/web/src/i18n/locales/de/ticket.json (the `report.*` keys)

files-write:

- apps/api/src/tickets/duplicates.ts (new) with apps/api/src/tickets/report.ts (the `parent_ticket_id` of the create path)
- apps/api/src/index.ts (the registration of the new routes)
- packages/shared/src/schemas/ticket.ts (the open-ticket, comment and `parentTicketId` schemas)
- apps/web/src/features/tickets/report-form-page.tsx with apps/web/src/i18n/locales/{de,en}/ticket.json (the hint and its texts)

interfaces:

- `GET /api/v1/public/tickets/open?qrToken=&systemId=` — the open tickets of the object of the current QR token: `{ tickets: [{ ticketId, ticketNo, status, reportedAt }] }`, oldest first, without description, contact, photo or `status_token`
- `POST /api/v1/public/tickets/:ticketNo/comments` — body `{ qrToken, text?, faultTemplateKeys?, contact?, locale? }`, answer `201 { ticketNo, at }`; the **QR token of the object is the capability**: the ticket must belong to the object of that token and must still be open
- one append-only `ticket_events` row `type = 'comment'`, `actor_kind = 'public'`, payload `{ source: 'duplicate_hint', locale, text, faultTemplateKeys, contact }`
- `publicReportRequestSchema` gains the optional `parentTicketId` (UUID); the accepted value is stored in `tickets.parent_ticket_id`
- new error codes: `ticket_not_found` (404), `ticket_closed` (422), `ticket_object_mismatch` (422), `comment_text_required` (422), `duplicate_parent_invalid` (422)
- i18n keys `report.duplicate.*` and `report.errors.{ticket_closed,ticket_not_found,ticket_object_mismatch,comment_text_required,duplicate_parent_invalid}` in `de` and `en`

## Task

`PLAN.md` §10 asks for a duplicate hint on an open ticket of the same object with
"create anyway" and "add to existing". This package implements both halves in one
run, without a split — the file budget of `PLAN.md` §17 is exceeded on purpose
(the route registration and the two locale files are the fifth and sixth file).

1. `packages/shared/src/schemas/ticket.ts`: `OPEN_TICKET_STATUSES` and
   `isOpenTicketStatus` (open = every status except `CLOSED` and `CANCELLED`),
   `publicOpenTicketsQuerySchema`, `publicOpenTicketSchema`,
   `publicOpenTicketsResponseSchema`, `publicTicketCommentRequestSchema`,
   `publicTicketCommentResponseSchema` and the optional `parentTicketId` of the
   report request.
2. `apps/api/src/tickets/duplicates.ts`: `findOpenTickets` (the current QR token of
   an active object, the `systemId` filter, spam and closed tickets hidden) and
   `addPublicComment` (the ticket of the object, still open, one `comment` event);
   the two public routes with the `invalid_request` envelope.
3. `apps/api/src/tickets/report.ts`: the optional `parentTicketId` — an unknown or
   foreign parent answers `422 duplicate_parent_invalid`, a parent that was closed
   in the meantime is ignored, so the report is still created.
4. `apps/api/src/index.ts`: register `publicDuplicateRoutes`.
5. `apps/web/src/features/tickets/report-form-page.tsx`: the query for the open
   tickets (the key carries the chosen system), the hint with one "Ergänzen"
   button per open ticket and one "Trotzdem neu melden" button, the comment path
   (contact optional) and the `parentTicketId` of every new report.
6. `apps/web/src/i18n/locales/{de,en}/ticket.json`: the keys of the hint.
7. Fixtures: `apps/api/src/tickets/__tests__/duplicates.integration.spec.ts` (new)
   and `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`.

## Non-goals

- No migration — `tickets.parent_ticket_id` and `ticket_events` exist (§4.8/§4.9).
- No office UI for the duplicate relation — the ticket list of phase 4.
- No notification of the office about a comment, no offline outbox (WP-M2-09).
- No edit of a comment: an event is append-only (`PLAN.md` §6).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npx vitest run src/tickets/__tests__/duplicates.integration.spec.ts
npx vitest run src/features/tickets/__tests__/report-form-page.test.tsx
npm run wp:check
```

Expected: all green; the eight new integration cases and the three new form
cases pass against the reachable PostgreSQL of `TEST_DATABASE_URL`.

## Handoff

- Files changed: `apps/api/src/tickets/duplicates.ts` (new),
  `apps/api/src/tickets/report.ts`, `apps/api/src/index.ts`,
  `packages/shared/src/schemas/ticket.ts`,
  `apps/web/src/features/tickets/report-form-page.tsx`,
  `apps/web/src/i18n/locales/{de,en}/ticket.json`, the fixtures
  `apps/api/src/tickets/__tests__/duplicates.integration.spec.ts` (new) and
  `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`, the spec
  `specs/06-report-form.md` (§7.8) and the bookkeeping
- Interfaces added: `GET /api/v1/public/tickets/open`,
  `POST /api/v1/public/tickets/:ticketNo/comments`, the optional `parentTicketId`
  of the report request, the `comment` event of the public path, the five error
  codes and the i18n keys of the hint
- Verified: `npm run check` green — typecheck (3 workspaces), `eslint .` (0 errors,
  the one pre-existing `photo-upload.tsx` fast-refresh warning), `vitest run` 40 files /
  235 tests against the reachable PostgreSQL of `TEST_DATABASE_URL` (not skipped),
  `i18n:check` (180 keys in `de` and `en`), `wp:check` and `npm run test:e2e` green
  with `E2E_CHROMIUM_PATH=/usr/bin/chromium` (4 Playwright tests); `npm run build` green
- Follow-up WP: none — the duplicate relation in the office list belongs to the ticket
  workflow of phase 4, the offline outbox to the existing WP-M2-09
- Open question: none
