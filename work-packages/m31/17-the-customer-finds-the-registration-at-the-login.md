# WP-M31-17: the customer finds the registration at the login of the homepage

format: ctx-256k
status: done
depends-on: WP-M31-16
phase: 31
milestone: m31
context-budget: 40k tokens
spec: specs/19-customer-portal.md §19.3 (the registration), §19.11 (the pages)
spec-lines: 30
changed-lines: 90

files-read:

- specs/19-customer-portal.md §19.3 (the registration), §19.11 (the pages of the portal)
- apps/web/src/auth/login-form.tsx (the login of the homepage)
- apps/web/src/App.tsx (the frame of the app, ADR-0061)
- apps/web/src/features/customer/portal-auth-page.tsx (the tabs of the portal)
- apps/web/src/features/customer/portal-tickets-page.tsx (the pages of the portal)
- apps/web/src/routes/__tests__/index.test.tsx (the test of the route table)

files-write:

- apps/web/src/auth/login-form.tsx
- apps/web/src/auth/**tests**/login-form.test.tsx
- apps/web/src/routes/__tests__/index.test.tsx

interfaces:

- the link `/portal/auth?tab=register` under the login of the homepage
- the tab of the portal from the URL (`?tab=register`, `?tab=reset`)
- the guard of the portal: without a session it leads to `/portal/auth`
- the frame of the app owns the way of the customer after the sign in — every
  internal address sends him into his portal (ADR-0061)

## Task

1. **The registration belongs to the login of the homepage** (§19.3): the
   customer arrives at the homepage of the app, signs in — and finds the entry
   to the registration of the customer portal. The entry appears only when the
   instance has a mailbox, because only then a registration is possible.
2. **The link opens the registration directly**: the portal reads the tab from
   the URL (`?tab=register`, `?tab=reset`).
3. **The portal asks for the sign in**: without a session the pages of the
   portal lead to `/portal/auth` instead of showing an empty list. The way of
   a customer after the sign in belongs to the frame of the app (ADR-0061):
   every internal address sends him into his portal. The login form of the
   homepage therefore no longer navigates itself into the portal — the frame
   owns the way, and the form only writes the session.
4. **The tests** prove the entry of the registration and its absence without a
   mailbox, and that the customer lands in his portal.

## Non-goals

- No change of the routes of the portal and no change of the API.
- No change of the login of the office.

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

- Files changed: the login of the homepage and the two tests of the way of the
  customer
- Interfaces added: the link of the registration, the tab of the URL, the
  redirect of the customer and the guard of the portal
- Verified: the commands above
- Follow-up WP: none — the phase is closed
- Open question: none
