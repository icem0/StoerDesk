# WP-M31-15: the customer sees the reports of his address

format: ctx-256k
status: done
depends-on: WP-M31-14
phase: 31
milestone: m31
context-budget: 40k tokens
spec: specs/19-customer-portal.md §19.5 (the portal of the customer)
spec-lines: 20
changed-lines: 220

files-read:

- specs/19-customer-portal.md §19.5 (the portal of the customer)
- apps/api/src/customers/routes.ts (the routes of the portal)
- apps/api/src/customers/**tests**/portal.integration.spec.ts (the test of the portal)
- apps/web/src/features/customer/portal-tickets-page.tsx (the list of the portal)
- apps/api/src/auth/sessionPlugin.ts (the account of the request carries the address)

files-write:

- apps/api/src/customers/routes.ts
- apps/api/src/customers/**tests**/portal.integration.spec.ts
- apps/web/src/features/customer/portal-tickets-page.tsx
- apps/web/src/i18n/locales/de/customer.json
- apps/web/src/i18n/locales/en/customer.json

interfaces:

- `GET /api/v1/customer/tickets` — the own tickets and the reports of his address
- `GET /api/v1/customer/tickets/:ticketNo` — the same rule for the detail
- `portal.addressHint` — the hint of the list

## Task

1. **The ownership of a ticket** (§19.5): the customer sees the tickets whose
   customer he is **and** the tickets that carry his address — a report he
   made before his registration belongs to him as well. The comparison of the
   address ignores the case.
2. **The list and the detail** use the same rule, so the detail of a report of
   his address opens in the portal.
3. **The page** names the rule in a hint under the heading.
4. **The test** proves that the report of his address is in the list and that
   the ticket of the other customer is not.

## Non-goals

- No change of the report form and no change of the assignment.
- No contact data of the reporter in the portal — only the ticket.

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

- Files changed: the routes of the portal, the test, the list and the texts
- Interfaces added: the rule of the ownership of a ticket
- Verified: the commands above
- Follow-up WP: WP-M31-16 — the administration knows the customer
- Open question: none
