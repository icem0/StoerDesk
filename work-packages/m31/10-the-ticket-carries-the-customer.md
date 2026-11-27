# WP-M31-10: the ticket carries the customer

format: ctx-256k
status: done
depends-on: WP-M31-09
phase: 31
milestone: m31
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.7 (the customer on the ticket)
spec-lines: 20
changed-lines: 420

files-read:

- specs/19-customer-portal.md §19.7 (the customer on the ticket)
- apps/api/src/tickets/internal.ts (the internal creation)
- apps/api/src/tickets/**tests**/internal-report-metadata.integration.spec.ts (the pattern of the test)
- apps/web/src/features/tickets/internal-create-page.tsx (the form of the office)
- apps/api/src/objects/assignments.ts (the trained people of an object)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the form)

files-write:

- apps/api/src/tickets/internal.ts
- apps/api/src/tickets/**tests**/internal-customer.integration.spec.ts
- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `internalCreateTicketRequestSchema` — the field `customerUserId`
- `POST /api/v1/tickets` — the customer of the ticket
- the field „Kunde“ of the internal creation

## Task

1. **The internal report** `apps/api/src/tickets/internal.ts`: the customer of
   the ticket is one of the trained people of the object; a customer that is
   not trained for it is refused with `422 customer_not_found`. The reporter
   stays free text — the customer is not the reporter (ADR-0055).
2. **The form** `apps/web/src/features/tickets/internal-create-page.tsx`: the
   field „Kunde“ offers the trained people of the picked object and writes the
   chosen one into the request. A new object starts with no customer.
3. **The texts** in the locales `de` and `en`.
4. **The test** proves that the customer is written into the ticket, that a
   customer who is not a trained person of the object is refused and that a
   ticket without a customer stays without one.

## Non-goals

- No list of the office with a column of the customer — that comes with the
  criterion of the phase.
- No change of the reporter data of the ticket.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the internal report, the test, the form and the texts
- Interfaces added: the field `customerUserId` of the internal creation
- Verified: the commands above
- Follow-up WP: WP-M31-11 — the action `notify_reporter`
- Open question: none
