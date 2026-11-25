# WP-M38-04: the landing page of the customer

format: ctx-256k
status: done
depends-on: WP-M38-01
phase: 38
milestone: m38
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.5, §19.11; PLAN.md §16
spec-lines: 60
changed-lines: 560

files-read:

- specs/19-customer-portal.md §19.3–§19.6, §19.11 (the portal, the pages)
- apps/api/src/customers/routes.ts (the list and the detail of the portal)
- apps/api/src/customers/public-routes.ts (the registration)
- apps/web/src/features/customer/portal-tickets-page.tsx (the pages of the portal)
- apps/web/src/features/customer/portal-auth-page.tsx (the sign in of the portal)
- apps/web/src/auth/usePermission.ts (the `me` payload with the roles)
- apps/web/src/routes/index.tsx (the addresses of the app)
- packages/shared/src/schemas/customer.ts (the contracts of the portal)

files-write:

- packages/shared/src/schemas/customer.ts (the `open` flag of the summary)
- apps/api/src/customers/routes.ts (the list carries the open tickets and the closed ones)
- apps/api/src/customers/__tests__/portal.integration.spec.ts
- apps/web/src/features/customer/portal-tickets-page.tsx (the landing page, the groups)
- apps/web/src/App.tsx (the frame of the app sends a customer into his portal)
- apps/web/src/features/customer/__tests__/portal-tickets-page.test.tsx
- apps/web/src/auth/login-form.tsx (the sign in of a customer lands in his portal)
- apps/web/src/features/customer/portal-auth-page.tsx (the sign in lands in the portal)
- apps/web/src/routes/index.tsx (the address `/portal`, the start page of a customer)
- apps/web/src/i18n/locales/de/customer.json (the texts of the landing page)
- apps/web/src/i18n/locales/en/customer.json (the texts of the landing page)

interfaces:

- `customerTicketSummarySchema` — gains the flag `open`: the ticket is still open
- `GET /api/v1/customer/tickets` — the open tickets of the customer first, the closed ones below
- `/portal` — the landing page of the customer; exactly one open ticket opens its detail directly
- `POST /api/v1/auth/login` — a user with the role `customer` lands in his portal, never in the internal application

## Task

The portal of the customer exists (§19.5), but it has no landing page of its
own: `/portal` falls into the catch-all page of the app, the list shows the
open tickets only and a customer who signs in through the ordinary login of
the office lands in the internal application instead of in his portal. ADR-0061
decides the landing page and the rule of the one open ticket.

1. `packages/shared/src/schemas/customer.ts`: the summary of a ticket of the
   portal gains the flag `open` — the ticket is still open, that is, its
   status is neither `CLOSED` nor `CANCELLED`.
2. `apps/api/src/customers/routes.ts`: the list of the portal answers the
   **open** tickets of the customer first and the closed ones below them; the
   answer of a row carries the flag `open`. The rights and the rule of the
   portal stay as they are — a ticket of somebody else remains `404`.
3. `apps/web/src/features/customer/portal-tickets-page.tsx`: the page becomes
   the landing page of the customer. It shows the group of the open tickets
   and below them the group of the closed ones. **Exactly one open ticket**
   opens its detail directly — the page navigates to
   `/portal/tickets/:ticketNo` instead of showing a list of one.
4. `apps/web/src/features/customer/portal-auth-page.tsx`: the sign in of the
   portal lands in `/portal`.
5. `apps/web/src/routes/index.tsx` and `apps/web/src/App.tsx`: `/portal` carries
   the landing page next to `/portal/tickets`, and the frame of the app sends a
   user with the role `customer` into his portal instead of into the internal
   application — the sign in of the office drops him nowhere else.
6. The texts of the landing page live in the namespace `customer`
   (`portal.open`, `portal.closed`) in `de` and `en`.
7. The tests: the API answers the open tickets and the closed ones with the
   flag; the page shows both groups and opens the detail of the one open
   ticket.

## Non-goals

- No change of the registration (§19.3) and no change of the role `customer`.
- No ticket of another customer, no internal entry (ADR-0034, ADR-0038).
- No report of a malfunction from the portal — the report stays the way of
  the code (§7.10).

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

- Files changed: the contract, the route of the list, the pages of the portal,
  the addresses, the two locales and the two test files
- Interfaces added: the flag `open`, the address `/portal`
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm run wp:check` and the web test of the portal are green; the integration test of the API needs a PostgreSQL and is **unverified** in this environment (no database, no Docker daemon)
- Follow-up WP: none — the phase 38 is closed with this package
- Open question: none
