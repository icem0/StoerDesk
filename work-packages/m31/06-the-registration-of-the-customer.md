# WP-M31-06: the registration of the customer

format: ctx-256k
status: planned
depends-on: WP-M31-05
phase: 31
milestone: m31
context-budget: 55k tokens
spec: specs/19-customer-portal.md §19.3 (the registration), §19.4 (the forgotten password)
spec-lines: 60
changed-lines: 793

files-read:

- specs/19-customer-portal.md §19.3 (the registration), §19.4 (the forgotten password)
- apps/api/src/notifications/channels/email.ts (the mail, the templates, the placeholders)
- apps/api/src/notifications/config.ts (the mailbox of the instance)
- apps/api/src/auth/password.ts (the hash of the password)
- apps/api/src/auth/session.ts (the sessions of an account)
- apps/api/src/db/schema.ts (the tables `account_tokens`, `users`, `user_roles`)
- apps/api/src/auth/routes.ts (the rate limit of the public routes)
- packages/shared/src/schemas/customer.ts (the contracts of the registration)

files-write:

- apps/api/src/customers/registration.ts
- apps/api/src/customers/mail.ts
- apps/api/src/customers/public-routes.ts
- apps/api/src/customers/**tests**/registration.integration.spec.ts
- apps/api/src/notifications/channels/email.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/public/auth/registration` — `{ available }`
- `POST /api/v1/public/auth/register` — the request of the registration
- `POST /api/v1/public/auth/password-reset` — the request of a new password
- `GET /api/v1/public/auth/token/:token` — the purpose and the address of the link
- `POST /api/v1/public/auth/token/:token/password` — the new password of the account
- `createPendingCustomer(database, values)` — the pending account and its token
- `readAccountToken(database, token)` / `consumeAccountToken(database, token, password)`
- `readMailbox(database, env)` — the mailbox of the instance and whether it can send
- `sendRegistrationMail(mailbox, address, link, locale)` / `sendPasswordResetMail(...)`

## Task

1. **The service** `apps/api/src/customers/registration.ts`: the pending account
   with the role `customer` and `active = false`, the token of 32 random bytes
   as base64url that is stored as its SHA-256 hash, the expiry of 24 hours, the
   reading of a token and its use — the new password, the activation of the
   account and the consumption of the token.
2. **The mails** `apps/api/src/customers/mail.ts`: the mailbox of the instance
   (the row of the channel wins over the environment) and the two mails of the
   portal. The kinds `registration` and `password_reset` get their own
   templates in the mailbox of the instance; the placeholders `{link}` and
   `{email}` are filled and escaped.
3. **The routes** `apps/api/src/customers/public-routes.ts`: the availability,
   the registration, the forgotten password, the token and the new password.
   Every answer is the same for every address; a mail that fails does not undo
   the registration.
4. **The registration** of the routes in `apps/api/src/index.ts`.
5. **The test** proves that the registration is refused without a mailbox, that
   the customer is created inactive with the role `customer`, that the token is
   stored as a hash, that the link activates the account, that the customer can
   log in afterwards, that a used token is refused and that an unknown address
   is answered like every other one.

## Non-goals

- No page of the portal — the pages come with WP-M31-07.
- No registration in the report form — that is WP-M31-08.
- No change of the channels of the office; the mail of the portal uses the
  mailbox of the instance.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the service of the registration, the mails, the public routes,
  the registration of the routes, the kinds of the mail and the test
- Interfaces added: the five public routes and the functions of the service
- Verified: the commands above
- Follow-up WP: WP-M31-07 — the pages of the portal
- Open question: none
