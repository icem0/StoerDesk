# WP-M43-03: the effect of the switches

format: ctx-256k
status: planned
depends-on: WP-M43-02
phase: 43
milestone: m43
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.3 (the registration), §19.5 (the portal), §19.6 (the report form), §19.13 (the switch)
spec-lines: 60
changed-lines: 460

files-read:

- specs/19-customer-portal.md §19.3, §19.5, §19.6, §19.13
- apps/api/src/customers/public-routes.ts (the public routes of the registration)
- apps/api/src/customers/routes.ts (the routes of the portal)
- apps/api/src/auth/routes.ts (the sign in)
- apps/api/src/tickets/report.ts (the report by QR code)
- apps/api/src/settings/customers.ts (the switches)

files-write:

- apps/api/src/customers/public-routes.ts
- apps/api/src/customers/routes.ts
- apps/api/src/auth/routes.ts
- apps/api/src/tickets/report.ts
- apps/api/src/customers/__tests__/phase31-exit.integration.spec.ts
- apps/api/src/customers/__tests__/portal.integration.spec.ts
- apps/api/src/customers/__tests__/registration.integration.spec.ts
- apps/api/src/customers/__tests__/qr-registration.integration.spec.ts

interfaces:

- `GET /api/v1/public/auth/registration` — `{ available }` only with the switch and a ready mailbox
- `403 customer_portal_disabled` — the routes of the portal while the portal is off
- `409 registration_unavailable` — the registration while the switch is off or the mailbox is broken

## Task

1. **The availability** of the registration needs the switch **and** the ready
   mailbox — the entry of the registration disappears from the login of the
   homepage and from the report form of the QR code.
2. **The portal** answers `403 customer_portal_disabled` while the portal is
   off. The guard is a **preHandler of the routes** and not a hook: the plugin
   of the portal uses `fastify-plugin` and is therefore not encapsulated — a
   hook would guard every route of the app.
3. **The sign in** of a customer is refused while the portal is off — the
   switch is asked after the password was verified, so the answer of a wrong
   password stays a `401`.
4. **The report form** of the QR code refuses the registration while the switch
   is off (`409 registration_unavailable`).
5. **The tests** of the portal switch the portal on — the default is off.

## Non-goals

- No change of the portal and no change of the registration.
- No page of the administration — that is WP-M43-04.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the tests of the portal switch the portal on and pass.

## Handoff

- Files changed: the public routes, the routes of the portal, the sign in, the
  report and the tests of the portal
- Interfaces added: the codes `customer_portal_disabled` and
  `registration_unavailable`
- Verified: the commands above
- Follow-up WP: WP-M43-04 — the page of the administration
- Open question: none
