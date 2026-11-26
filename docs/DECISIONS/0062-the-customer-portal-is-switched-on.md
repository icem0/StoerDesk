# ADR-0062: The customer portal is switched on — and the registration needs a cleanly set up mailbox

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, administration, customer

## Context

Phase 31 gave the customer of an installation an account, a registration over a
link in the mail and a portal with his reports. The installation can now have
customers — and many installations want none:

1. An operator without customers does not want a portal: the entry in the login
   of the homepage, the pages of the portal and the accounts of the role
   `customer` would be dead weight in the interface.
2. The registration depends on the **mailbox of the instance**. A mailbox that
   is not cleanly set up — no row, a disabled channel, a missing host, a
   missing or invalid sender address, a login without a password — cannot
   deliver the confirmation of an account. A registration in such an
   installation creates accounts that nobody can confirm and nobody can use.

The office asked for a switch in the administration: the customer portal and
the registration are off until somebody turns them on, and the registration
stays locked while the mailbox is broken.

## Decision

1. **Two switches in the administration** (`/admin/customers`, the entry
   „Kundenportal" in the settings menu):
   - `customer.portal_enabled` — the customer may sign in and sees his reports
     in the portal,
   - `customer.registration_enabled` — the customer may register himself over
     the link in the mail.
2. **Both switches are off by default.** An installation that does not want a
   customer portal keeps none: the login of the customer is refused
   (`403 customer_portal_disabled`), the pages of the portal answer the same
   code, and the registration of the QR code form is refused
   (`409 registration_unavailable`). The office switches the portal on — the
   customers of an existing installation then get their access.
3. **The registration needs a cleanly set up mailbox.** The mailbox of the
   instance is *ready* when the channel row exists, is enabled, carries a
   host, carries a valid sender address and a complete login (a user without a
   password is not a login). The switch of the registration is refused while
   the mailbox is not ready (`422 mail_not_ready`), and the page names the
   reasons (`host_missing`, `sender_invalid`, …) and links to the mailbox of
   the instance (`/admin/email`).
4. **The server decides, the page only shows.** The public route
   `GET /api/v1/public/auth/registration` answers `available` only when the
   switch is on **and** the mailbox is ready — the entry of the registration
   disappears from the login of the homepage and from the report form of the
   QR code. The write of the switches is behind `settings.write`, the read
   behind `settings.read`.
5. **The mailbox is the reason, not a second switch.** There is no switch
   „Postfach“: the mailbox of the instance is a channel like every other
   channel (`/admin/email`), and its state decides.

## Alternatives

- **A switch only for the registration.** Rejected: an installation that does
  not want customers at all would still have the portal, the pages and the
  entry in the login.
- **The registration without a mailbox, the confirmation by the office.**
  Rejected: the office would have to write to every customer by hand — the
  report of a fault would wait for the office.
- **The switch per installation in the environment.** Rejected: a switch in the
  `.env` is changed by a restart of the stack; the administration changes the
  switch without a restart.
- **The readiness of the mailbox as a warning instead of a lock.** Rejected:
  the office asked for it — a registration that cannot be confirmed is an
  account that cannot be used.

## Consequences

- The settings of the instance carry two more rows: `customer.portal_enabled`
  and `customer.registration_enabled`.
- The mailbox learns its **readiness** with the reasons of a broken setup; the
  page of the customers and the page of the mailbox show them.
- The tests of the portal switch the portal on — the default is off.
- A customer who is signed in while the office switches the portal off keeps
  his session, but every route of the portal answers
  `403 customer_portal_disabled` from then on.
