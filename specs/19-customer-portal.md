# 19 — The portal of the customer

**Chapter:** new chapter (the customer portal), with the changes of the report
form (§7), the RBAC (§3), the data model (§4) and the escalation (§8)
**Scope:** ~330 lines
**Status:** authoritative for phase 30 — it carries the content of
ADR-0053 … ADR-0056 and replaces the placeholders of the chapters it touches.
`PLAN.md` §16 (phase 30) is the binding summary.

The customer of an installation is a person the operator has instructed for
this object — the **trained person** ("eingewiesene Person"). Today he is
nowhere in the system: he reports a fault by QR code, his name stands as free
text on the ticket and nobody can show him the state of his reports. Phase 30
gives him an account, the office gives him his installations, and the ticket
names him.

The emergency rule of `PLAN.md` §2 holds unchanged: the 112 notice stays
visible on every public page, StörDesk is never a path of the emergency call
and no other emergency number enters the product text.

## §19.1 The customer is a user with the role `customer`

- A customer is a row of `users` with the role `customer`. There is no
  `customers` table (ADR-0053).
- The role `customer` is a **system role**: it is seeded with every seed run
  and its permission set is rewritten then (`specs/01-rbac.md` §3.5). Its
  permission set is exactly:
  | Permission             | Meaning                         |
  | ---------------------- | ------------------------------- |
  | `ticket.customer.read` | the own tickets of the customer |
  | `object.customer.read` | the own objects of the customer |
- The administration writes a customer like every other user: the user
  administration (`/admin/users`) carries the role `customer` in the role
  picker, and the account is handed over with a one-time password
  (`specs/01-rbac.md` §3.9) — the same way as for a colleague of the office.
- A customer that opens an internal route gets `403 forbidden`. The guard of
  the server is the only enforcement point (§3.2); the portal only hides the
  entries the customer may not use.
- A customer is a user like every other one: he logs in over the same route
  (`POST /api/v1/auth/login`), his session is the same session cookie and his
  password is hashed the same way (Argon2id).

## §19.2 The trained person of an object

- The table `object_assignments` holds the pair (object, user): the
  **trained person** of the object (ADR-0053). It carries the user who
  created the assignment and the time.
- An object may carry several trained people; a customer may be trained for
  several objects. The pair is unique.
- The administration edits the assignments in the edit page of the object
  (`/objects/:objectNo/edit`): the list of the trained people, the field to
  add a customer, the button to remove one. The write needs the permission
  `object.assign`.
- The write is refused with `409 object_assignee_exists` when the pair
  already exists and with `404 user_not_found` when the customer does not
  exist.
- The assignments of an object are read by the internal creation of a ticket
  (§19.7) and by the portal of the customer (§19.5).

## §19.3 The registration

- The registration exists **only** when the e-mail channel of the instance is
  configured — the row of the channel carries a host and a sender, or the
  environment carries `SMTP_HOST` and `SMTP_FROM` (ADR-0009, ADR-0046). The
  route `GET /api/v1/public/auth/registration` answers
  `{ "available": true | false }`.
- The login page and the report form show the entry „Registrieren“ only when
  the answer is `true`; the API refuses the registration with
  `409 registration_unavailable` in any case.
- The request of the registration carries the e-mail address, the first name
  and the last name of the customer. It creates:
  1. a user with the role `customer`, `active = false` and
     `created_via = 'registration'`,
  2. a row of `account_tokens` with the purpose `registration`, the token as
     its SHA-256 hash, the expiry 24 h from now,
  3. the mail of the kind `registration` with the link to
     `/portal/activate/:token`.
- The answer is the same for every address — unknown, already in use, a
  colleague of the office. A difference would name the addresses of the
  installation to a stranger (ADR-0054).
- The registration of an address that already belongs to a user does not
  change that user: the request is answered the same way and no mail is sent
  to a colleague of the office with a link that would change his account.
- The rate limit of the public routes applies: 5 requests per minute per
  address and per IP (§3.6).
- The activation page `/portal/activate/:token` lies outside the shell of the
  app. It answers `404 token_unknown` and `410 token_expired`; the form
  consumes the token, sets the password and sets `active = true`.

## §19.4 The password forgotten

- „Passwort vergessen“ is the same mechanism with the purpose
  `password_reset`: the request carries the address, the mail of the kind
  `password_reset` carries the link to `/portal/activate/:token`, the customer
  sets a new password there.
- The answer of the request is the same for every address. The reset never
  changes the role, the assignments or the tickets of the account.
- A reset of a colleague of the office is allowed — it is his own password and
  not the password of a customer. The account stays a customer if it was one.

## §19.5 The portal of the customer

- The portal is the area of the customer: the public routes `/portal/auth`,
  `/portal/activate/:token` and the signed routes `/portal/tickets` and
  `/portal/tickets/:ticketNo`.
- The list of the portal shows the **open** tickets of the customer — the
  tickets whose `customer_user_id` is the signed-in user and whose status is
  not a terminal one. Every row names the number of the ticket, the title,
  the object, the priority and the state (the localized name of the status,
  §6.2).
- The detail of a ticket of the portal shows the ticket number, the title, the
  object, the priority, the state, the reported time and the **customer
  visible** history of the ticket: the events of the workflow and the comments
  that are not internal. The internal comments and the internal entries of the
  history never reach the portal (ADR-0034, ADR-0038).
- The portal also lists the objects of the customer — the objects of his
  assignments with their number and their name.
- A customer that opens the ticket of somebody else gets `404
ticket_not_found` — not `403`: the existence of the ticket is not his
  business.
- The portal shows no names of the office, no internal comments, no internal
  entries of the history and no data of the other customers.

## §19.6 The report by QR code

The report form of the QR code (`/m/:token`, `specs/06-report-form.md` §7)
carries three new checkboxes. The order of the form and the emergency notice
stay as they are.

1. **„Ich bin die vom Betreiber benannte eingewiesene Person (DIN 14675)“** —
   the confirmation of the reporter. The box is **always mandatory**: the
   report is only accepted with this confirmation. The API refuses a report
   without it with `400 trained_person_confirmation_required`. The value is
   stored on the ticket (`tickets.trained_person_confirmed`) so that the
   office can see that the reporter confirmed it.
2. **„Registrieren“** — the registration in the same step. The box is only
   shown when the e-mail channel of the instance is configured
   (`GET /api/v1/public/auth/registration`). A ticked box makes the **e-mail
   field mandatory**; the form refuses the report without an address
   (`400 registration_needs_email`).
3. **„Meldungen per E-Mail empfangen“** — the opt-in of the reporter. The box
   is **greyed out** as long as the e-mail field is empty and it is enabled
   with an address in the field. It may only be ticked together with an
   address; the value is stored on the ticket
   (`tickets.customer_email_notifications`) and is the condition of the action
   of §19.8.

The report with a registration writes in **one transaction**:

1. the ticket with its reporter data and the two flags,
2. the user of the customer — role `customer`, `active = false`,
   `created_via = 'qr_registration'`,
3. the row of `account_tokens` with the purpose `registration` and the
   expiry 24 h,
4. the assignment of the object of the QR token to the customer — the object
   is linked with the customer right away (ADR-0053),
5. the `customer_user_id` of the ticket,
6. the mail of the kind `registration` with the link to
   `/portal/activate/:token`.

The mail is sent after the transaction. A mail that fails does not undo the
report: the customer can ask for a new link. The report form says so.

## §19.7 The customer on the ticket

- The internal creation of a ticket (`/tickets/create`) offers the trained
  people of the object in the field „Kunde“; the chosen one is written into
  `tickets.customer_user_id`. The field is optional.
- The object of the ticket carries the assignments of the object, so the
  office names the customer without leaving the page.
- The ticket list and the ticket detail of the office show the customer of the
  ticket next to the reporter — the account and the free text of the report
  stay two things.
- The reporter data of the ticket never changes when a customer is chosen:
  the reporter is the person who reported, the customer is the trained person
  (ADR-0055).

## §19.8 The report of the reporter

- The action `notify_reporter` writes the ticket to the address of the
  reporter (ADR-0056). It is an action of a rule of a stage like every other
  action and is configured in the administration of the escalation.
- The action is sent only when the ticket carries the opt-in of the reporter
  (`tickets.customer_email_notifications`) and an address in
  `tickets.reporter_email`. A ticket without one of the two is skipped.
- The body is the mail of the kind `customer_ticket` of the mailbox of the
  instance; it names the ticket number, the priority, the object and the
  state. The internal comments and the internal entries of the history are
  never part of it.
- The action writes into the outbox of the installation, so the delivery
  appears in the log of the deliveries.

## §19.9 The data model

| Table / column                         | Content                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `users.role = customer`                | the customer is a user (`user_roles`)                                                                              |
| `users.created_via`                    | `admin` \| `registration` \| `qr_registration`                                                                     |
| `users.active`                         | `false` until the link of the registration was used                                                                |
| `account_tokens`                       | `user_id`, `purpose` (`registration` \| `password_reset`), `token_hash`, `expires_at`, `consumed_at`, `created_at` |
| `object_assignments`                   | `object_id`, `user_id`, `created_by_user_id`, `created_at`                                                         |
| `tickets.customer_user_id`             | the customer of the ticket, `ON DELETE SET NULL`                                                                   |
| `tickets.customer_email_notifications` | the opt-in of the reporter                                                                                         |
| `tickets.trained_person_confirmed`     | the confirmation of the reporter (DIN 14675)                                                                       |

The token is stored as the SHA-256 hash of the token; the plain text exists
once, in the mail. The unique index of the token hash makes the use of a token
a single act.

## §19.10 The routes

**Public (without a session)**

| Route                                            | Purpose                                    |
| ------------------------------------------------ | ------------------------------------------ |
| `GET /api/v1/public/auth/registration`           | `{ available }` — the e-mail channel works |
| `POST /api/v1/public/auth/register`              | the request of the registration            |
| `POST /api/v1/public/auth/password-reset`        | the request of a new password              |
| `GET /api/v1/public/auth/token/:token`           | `{ purpose, email, expiresAt }`            |
| `POST /api/v1/public/auth/token/:token/password` | the new password of the account            |

**The customer (with a session of the role `customer`)**

| Route                                    | Purpose                     |
| ---------------------------------------- | --------------------------- |
| `GET /api/v1/customer/tickets`           | the own open tickets        |
| `GET /api/v1/customer/tickets/:ticketNo` | the detail of an own ticket |
| `GET /api/v1/customer/objects`           | the own objects             |

**The office and the administration**

| Route                                                  | Purpose                      |
| ------------------------------------------------------ | ---------------------------- |
| `GET /api/v1/objects/:objectNo/assignments`            | the trained people           |
| `POST /api/v1/objects/:objectNo/assignments`           | the assignment of a customer |
| `DELETE /api/v1/objects/:objectNo/assignments/:userId` | the removal of an assignment |

The report form keeps its route `POST /api/v1/public/tickets`; the request
carries the three new fields of §19.6. The route of the QR token stays as it
is: the form asks `GET /api/v1/public/auth/registration` for the availability of
the registration — the confirmation of the trained person is always mandatory,
so the form needs nothing else from the token.

## §19.11 The pages

| Page                                | Route                       | Content                                                   |
| ----------------------------------- | --------------------------- | --------------------------------------------------------- |
| the sign in of the customer         | `/portal/auth`              | the tabs „Anmelden“, „Registrieren“, „Passwort vergessen“ |
| the activation of the account       | `/portal/activate/:token`   | the new password of the account                           |
| the tickets of the customer         | `/portal/tickets`           | the own open tickets                                      |
| the ticket of the customer          | `/portal/tickets/:ticketNo` | the detail with the visible history                       |
| the trained people of the object    | `/objects/:objectNo/edit`   | the assignments of the object                             |
| the customer on the internal ticket | `/tickets/create`           | the field „Kunde“                                         |
| the report form of the QR code      | `/m/:token`                 | the three checkboxes of §19.6                             |

The pages of the portal lie outside the shell of the app, like the report form
and the status page: a customer never sees the menu of the office.

## §19.12 The rules of the security

- The public routes of the registration are limited like the login
  (`5/min` per address and per IP) and answer the same way for every address.
- The token of a registration is stored as a hash, expires after 24 h and is
  consumed by its first use. The token is a bearer secret: the link is the
  secret, the mail is the only way to obtain it.
- The password of the customer is hashed like every other password
  (Argon2id); the rules of the password of the office apply unchanged.
- A customer reaches only his own data: the routes of the portal filter on
  `customer_user_id` and answer `404` for a ticket of somebody else.
- The activation of an account sets `active = true` and kills the sessions of
  the account — a registration that was confirmed on another device does not
  leave an open session of an inactive account behind.
- No PII of a customer enters a log line, an error message or a fixture.
- The mail to the reporter carries the ticket and nothing of the house
  (ADR-0034, ADR-0038).
