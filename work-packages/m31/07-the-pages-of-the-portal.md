# WP-M31-07: the pages of the portal — the sign in, the registration and the activation

format: ctx-256k
status: done
depends-on: WP-M31-06
phase: 31
milestone: m31
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.3, §19.4, §19.11 (the pages of the portal)
spec-lines: 60
changed-lines: 620

files-read:

- specs/19-customer-portal.md §19.3 (the registration), §19.4 (the forgotten password), §19.11 (the pages)
- apps/web/src/routes/index.tsx (the public routes outside the shell)
- apps/web/src/auth/login-form.tsx (the form of the login, the cache of the session)
- apps/web/src/i18n/index.ts (the namespaces)
- apps/web/src/lib/api.ts (the client of the API)
- apps/web/src/i18n/locales/de/common.json (the texts of the login)

files-write:

- apps/web/src/features/customer/portal-auth-page.tsx
- apps/web/src/features/customer/portal-activate-page.tsx
- apps/web/src/i18n/index.ts
- apps/web/src/i18n/locales/de/customer.json
- apps/web/src/i18n/locales/en/customer.json
- apps/web/src/routes/index.tsx

interfaces:

- `PortalAuthPage` — the tabs „Anmelden“, „Registrieren“ und „Passwort vergessen“
- `PortalActivatePage` — the page of the link of the mail
- the namespace `customer` of the texts of the portal
- the routes `/portal/auth` and `/portal/activate/:token`

## Task

1. **The namespace** `customer` in `apps/web/src/i18n/index.ts` with the files
   `de/customer.json` and `en/customer.json` — the texts of the portal.
2. **The page of the sign in** `portal-auth-page.tsx`: the three tabs. The
   registration is offered only when the instance has a mailbox
   (`GET /api/v1/public/auth/registration`); the tab „Registrieren“ is
   disabled otherwise. A successful sign in writes the session into the cache
   and leads to the portal.
3. **The page of the activation** `portal-activate-page.tsx`: the address of
   the account, the field of the new password and the answer of the API. A
   link that is not valid any more says so.
4. **The routes** `/portal/auth` and `/portal/activate/:token` lie outside the
   shell of the app — a customer never sees the menu of the office.

## Non-goals

- No list of the tickets — that is WP-M31-08.
- No text of the office in the portal.
- No change of the login of the office.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `npm run i18n:check` knows the new namespace and both
locales carry the same keys.

## Handoff

- Files changed: the two pages, the namespace, the two locale files and the
  routes
- Interfaces added: the two pages, the namespace and the two routes
- Verified: the commands above
- Follow-up WP: WP-M31-08 — the portal of the customer with his own tickets
- Open question: none
