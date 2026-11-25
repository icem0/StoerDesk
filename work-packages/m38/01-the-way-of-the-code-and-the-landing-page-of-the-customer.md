# WP-M38-01: the way of the code and the landing page of the customer

format: ctx-256k
status: done
depends-on: WP-M31-16 (the administration knows the customer), WP-M36-01
phase: 38
milestone: m38
context-budget: 40k tokens
spec: specs/06-report-form.md §7.10, specs/19-customer-portal.md §19.5; PLAN.md §10, §16
spec-lines: 180
changed-lines: 300

files-read:

- specs/06-report-form.md §7.1–§7.9 (the report form, the duplicate hint)
- specs/19-customer-portal.md §19.1–§19.12 (the portal of the customer)
- apps/api/src/tickets/duplicates.ts (the open tickets of an object, the public comment)
- apps/api/src/tickets/status.ts (the public status of a ticket)
- apps/api/src/customers/routes.ts (the list of the portal)
- apps/web/src/features/tickets/report-form-page.tsx (the page of `/m/:token`)
- apps/web/src/features/customer/portal-tickets-page.tsx (the page of `/portal/tickets`)

files-write:

- specs/06-report-form.md (§7.10 the way of the code)
- specs/19-customer-portal.md (§19.5 the landing page of the customer, §19.11 the addresses)
- docs/DECISIONS/0061-the-qr-code-leads-to-the-open-ticket-of-the-object.md
- docs/DECISIONS.md (the row of ADR-0061)
- PLAN.md (§10 the behaviour of the scan, §16 the phase 38)
- work-packages/README.md (the phase 38, the backlog)
- work-packages/m38/01-the-way-of-the-code-and-the-landing-page-of-the-customer.md
- work-packages/m38/02-the-public-view-of-an-open-ticket-of-the-object.md
- work-packages/m38/03-the-scan-opens-the-landing-page-of-the-object.md
- work-packages/m38/04-the-landing-page-of-the-customer.md

interfaces:

- `GET /api/v1/public/objects/:token/tickets/:ticketNo` — the public view of an open ticket of the object (WP-M38-02)
- `POST /api/v1/public/objects/:token/tickets/:ticketNo/comments` — the comment with the QR token of the object (WP-M38-02)
- `/m/:token` — the landing page of the object; `/m/:token/neu` — the report form (WP-M38-03)
- `/portal` — the landing page of the customer (WP-M38-04)

## Task

The office asked for two things: the scan of a code shall lead to the open
ticket of the object — with the possibility to open another one — and a
registered customer shall see his own landing page, which shows his open
tickets first and opens the detail of his one open ticket directly. Both are
**decisions**, not a bug: the repository has no landing page of the customer
(`/portal` falls into the catch-all page today) and the scan opens the report
form with a notice about the open ticket.

1. `docs/DECISIONS/0061-…md`: the ADR decides four points — the scan opens the
   landing page of the object and the form moves to `/m/:token/neu`; the public
   view of a ticket of the object is narrow (number, status, times, public
   events, public comments without the contact of the author); the QR token of
   the object is the capability of a comment on an **open** ticket of that
   object (SEC-004 keeps its force for the path of the `status_token`); the
   customer gets a landing page `/portal` with the open tickets first and the
   closed ones below, and exactly one open ticket opens its detail.
2. `docs/DECISIONS.md`: the row of ADR-0061.
3. `specs/06-report-form.md`: §7.10 names the three addresses of the code, the
   landing page, the contract of the public view and the contract of the
   comment of the object.
4. `specs/19-customer-portal.md`: §19.5 names the landing page of the customer
   and the rule of the one open ticket; §19.11 carries the address `/portal`.
5. `PLAN.md`: §10 carries the behaviour of the scan, §16 the row of the phase
   38 and the status paragraph. The phase runs **out of band** — the phase 36
   (the help popover) keeps its open packages.
6. `work-packages/README.md`: the phase 38 in the table of the phases and the
   four rows of the backlog.
7. The three child packages of this commit describe the implementation.

## Non-goals

- No implementation in this package — the code is WP-M38-02 … WP-M38-04.
- No change of the sticker: the code on the wall keeps its address.
- No internal comment ever reaches the public view (ADR-0034, ADR-0038).

## Acceptance

```bash
npm run wp:check
npm run lint
```

Expected: all green; the four packages of the phase are checked against the
limits of `ctx-256k`.

## Handoff

- Files changed: `specs/06-report-form.md`, `specs/19-customer-portal.md`,
  `docs/DECISIONS/0061-…md`, `docs/DECISIONS.md`, `PLAN.md`,
  `work-packages/README.md`, the four packages of the phase
- Interfaces added: the ADR-0061 and the four addresses of the phase
- Verified: the commands above
- Follow-up WP: WP-M38-02 (the public view of an open ticket of the object),
  WP-M38-03 (the scan opens the landing page of the object),
  WP-M38-04 (the landing page of the customer)
- Open question: none
