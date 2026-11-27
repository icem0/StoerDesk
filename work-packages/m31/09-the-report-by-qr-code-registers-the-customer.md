# WP-M31-09: the report by QR code registers the customer

format: ctx-256k
status: done
depends-on: WP-M31-08
phase: 31
milestone: m31
context-budget: 60k tokens
spec: specs/19-customer-portal.md §19.6 (the report form), §19.9, §19.11
spec-lines: 60
changed-lines: 700

files-read:

- specs/19-customer-portal.md §19.6 (the three checkboxes), §19.9 (the data model), §19.11 (the pages)
- apps/api/src/tickets/report.ts (the public report, the transaction, the outbox)
- apps/api/src/tickets/**tests**/report.integration.spec.ts (the pattern of the report test)
- apps/api/src/customers/registration.ts (the pending account and its token)
- apps/api/src/customers/mail.ts (the mail of the registration)
- apps/web/src/features/tickets/report-form-page.tsx (the form of the QR code)
- apps/web/src/lib/outbox.ts (the offline outbox of the report)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the form)

files-write:

- apps/api/src/tickets/report.ts
- apps/api/src/customers/registration.ts
- apps/api/src/customers/**tests**/qr-registration.integration.spec.ts
- apps/api/src/tickets/**tests**/report.integration.spec.ts
- apps/api/src/tickets/**tests**/duplicates.integration.spec.ts
- apps/api/src/tickets/**tests**/object-priority.integration.spec.ts
- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- scripts/e2e-acceptance.mjs
- specs/19-customer-portal.md

interfaces:

- `POST /api/v1/public/tickets` — the fields `trainedPersonConfirmed`, `emailNotifications` and `register`
- `findCustomerByEmail(database, email)` — the account of an address
- the three checkboxes of the report form

## Task

1. **The report** `apps/api/src/tickets/report.ts`: the confirmation of the
   trained person is mandatory (`400 trained_person_confirmation_required`),
   the opt-in for the messages needs an address
   (`422 email_notifications_need_email`) and the registration writes the
   account, the assignment of the object, the token and the customer of the
   ticket in the transaction of the report. The link leaves the installation
   after the transaction; a mail that fails does not undo the report.
2. **The account** `apps/api/src/customers/registration.ts` learns
   `findCustomerByEmail`: a reporter who registers a second time is the same
   customer, and the colleague of the office is never a customer.
3. **The form** `apps/web/src/features/tickets/report-form-page.tsx`: the three
   checkboxes — the confirmation is always mandatory, the registration appears
   only when the instance has a mailbox and makes the address mandatory, the
   opt-in for the messages is greyed out while the address is empty.
4. **The texts** in the locales `de` and `en`.
5. **The tests** of the reports carry the confirmation; the new test proves the
   refusal without the confirmation, the refusal of the opt-in without an
   address, the registration with the account, the assignment of the object and
   the customer of the ticket.

## Non-goals

- No change of the report form beyond the three checkboxes.
- No mail to the reporter — that is WP-M31-11.
- No change of the internal creation of a ticket — that is WP-M31-10.

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

- Files changed: the report, the account, the tests of the reports, the form,
  the texts, the acceptance script and the slice
- Interfaces added: the three fields of the report and `findCustomerByEmail`
- Verified: the commands above
- Follow-up WP: WP-M31-10 — the ticket carries the customer
- Open question: none
