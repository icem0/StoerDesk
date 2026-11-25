# ADR-0054: The registration confirms itself over a link — it exists only with a configured e-mail channel

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, customer

## Context

The customer should be able to register himself — from the login page and from
the QR code of his installation. A registration needs a confirmation, otherwise
anybody could register an address of somebody else and read the tickets of an
installation.

StörDesk has no way to reach a customer outside of the notifications of the
office: the e-mail channel is **optional**. It is active only when the row of
the channel carries a host and a sender (`notification_channels`, kind
`email`; the environment `SMTP_HOST`/`SMTP_FROM` is the fallback) — ADR-0009,
ADR-0046. An installation without a mail server has no e-mail at all.

A password link needs the same channel. A registration without a channel
would create accounts that nobody can confirm and nobody can log in — the
worst of both worlds.

## Decision

1. **The registration exists only with a configured e-mail channel.** The
   route `GET /api/v1/public/auth/registration` answers
   `{ "available": false }` when the channel of the instance is not
   configured. The login page and the report form hide the entry
   „Registrieren“ in that case; the API refuses the registration with
   `409 registration_unavailable`. A customer without a mail server keeps
   the anonymous report form — the way of today.
2. **The registration is confirmed over a link.** The registration creates a
   user with the role `customer` and a row of `account_tokens` with the purpose
   `registration`. The mail carries the link to `/portal/activate/:token`;
   the customer sets his password there and the account becomes usable. The
   token is valid for 24 hours, is consumed by its first use and is stored
   only as the SHA-256 hash of the token — the plain text exists once, in the
   mail.
3. **The answer never names the address.** The registration and the request
   for a new password always answer the same way, whether the address is
   unknown, already in use or belongs to a colleague of the office. A
   difference in the answer would tell a stranger which addresses exist in the
   installation. The office learns about a registration from the ticket it
   carries, not from the answer of the route.
4. **The password is never sent.** "Passwort vergessen" is the same mechanism
   with the purpose `password_reset`: the mail carries a link to
   `/portal/activate/:token`, the customer sets a new password. An address of
   the office is never changed by such a link — a user without the role
   `customer` gets a reset of his own password, nothing else.
5. **The rate limit of the public routes applies.** The registration and the
   request for a new password are limited per address and per IP; the limit of
   the login (`5/min`) is the model (`specs/01-rbac.md` §3.6).

## Alternatives

- **A password chosen by the customer, a link only for the confirmation.**
  Rejected: two secrets (the password and the token) reach the customer, and
  a customer who loses the first mail has to start again. One link that sets
  the password is one secret and one step.
- **A registration without a confirmation.** Rejected: anybody could register
  the address of a customer and read his tickets.
- **The confirmation by the office instead of by the mail.** Rejected: the
  office would have to write to every customer by hand — the report of a fault
  would wait for the office.
- **The registration always available, the mail sent when a channel appears.**
  Rejected: the accounts would pile up unconfirmed, and a customer would not
  know why his password never arrives.

## Consequences

- The mail of the registration is a kind of the mailbox of the instance
  (`registration`, `password_reset`); the administration can change its text
  under `/admin/email` (ADR-0046).
- The link carries no secret of the customer — only the token; the API
  answers `410 token_expired` or `404 token_unknown`.
- The activation page is a public page outside the shell of the app: it is
  reachable without a session, like the report form and the status page.
- The customer account exists from the moment of the registration, but it is
  not usable until the link was used — `users.active` is `false` until then
  and a session of an inactive user counts as no session.
