# WP-M43-02: the settings of the portal and the readiness of the mailbox

format: ctx-256k
status: planned
depends-on: WP-M43-01
phase: 43
milestone: m43
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.13 (the switch), §19.14 (the mailbox)
spec-lines: 60
changed-lines: 420

files-read:

- specs/19-customer-portal.md §19.13 (the switch), §19.14 (the mailbox)
- apps/api/src/settings/dashboard.ts (the pattern of a settings route)
- apps/api/src/customers/mail.ts (the mailbox of the instance)
- apps/api/src/db/schema.ts (the table of the settings)
- packages/shared/src/permissions.ts (the permissions of the administration)

files-write:

- packages/shared/src/schemas/customer.ts
- apps/api/src/settings/customers.ts
- apps/api/src/customers/mail.ts
- apps/api/src/index.ts
- apps/api/src/customers/__tests__/portal-switch.integration.spec.ts

interfaces:

- `GET|PUT /api/v1/settings/customers` — the switches of the portal and of the registration
- `customer.portal_enabled` / `customer.registration_enabled` — the settings of the instance
- `readCustomerPortalSettings(database, env)` — the state of the portal
- `readCustomerPortalSwitches(database)` — the two switches alone
- `Mailbox.ready` / `Mailbox.reasons` — the readiness of the mailbox

## Task

1. **The contracts** `packages/shared/src/schemas/customer.ts`: the state of
   the portal (`portalEnabled`, `registrationEnabled`, `mailReady`,
   `mailReasons`) and the write of the administration.
2. **The settings** `apps/api/src/settings/customers.ts`: the read behind
   `settings.read` and the write behind `settings.write`. The write of the
   registration is refused while the mailbox is broken (`422 mail_not_ready`).
3. **The readiness** `apps/api/src/customers/mail.ts`: the mailbox names
   whether it is cleanly set up and why it is not.
4. **The test** proves that both switches are off by default, that the
   registration is refused while the mailbox is broken, that the reasons are
   named and that the switches are written into the settings of the instance.

## Non-goals

- No effect of the switches on the routes — that is WP-M43-03.
- No page of the administration — that is WP-M43-04.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the contracts, the settings route, the readiness of the mailbox,
  the registration of the route and the test
- Interfaces added: the route of the settings and the readiness of the mailbox
- Verified: the commands above
- Follow-up WP: WP-M43-03 — the effect of the switches
- Open question: none
