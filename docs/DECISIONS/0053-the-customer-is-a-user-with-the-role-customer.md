# ADR-0053: The customer is a user with the role `customer` — the trained person is an assignment of the object

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, administration, customer

## Context

The report form of the QR code collects a name, a phone number and an e-mail
address as free text on the ticket (`tickets.reporter_name`,
`tickets.reporter_phone`, `tickets.reporter_email`). The person who reports a
fault has no account, so the office cannot show him the state of his reports
and cannot tell him that his report is being worked on.

The operator names a **trained person** ("eingewiesene Person") per
installation — the person who was instructed for the object and who is
entitled to report a fault for it. Today this person exists nowhere in the
system: `objects` carries the contact data of the operator as free text
(`contact_name`, `contact_phone`, `contact_email`) and there is no link between
an object and a person.

The office asked for three things:

- a customer can register himself and log in,
- the administration can assign an installation to a customer — the trained
  person of the object,
- the ticket of an object can name that trained person.

## Decision

1. **The customer is a user with the role `customer`.** There is no separate
   `customers` table: a customer is a row of `users` with the role `customer`
   (`users.roles` → `user_roles`). He logs in with the same session cookie and
   the same login route as every other user; his permissions are the two keys
   `ticket.customer.read` and `object.customer.read` and nothing else. A
   customer that tries to open an internal route gets `403 forbidden` — the
   guard of the server stays the only enforcement point (`specs/01-rbac.md`
   §3.2).
2. **The trained person is an assignment of the object to a customer.** The
   table `object_assignments` holds the pair (object, user) with the creating
   user and the time. An object may carry several trained people, a customer
   may be trained for several objects. The assignment is not a role — the
   customer keeps the role `customer` and only the objects of his assignments
   are his.
3. **The administration assigns the object.** `object.assign` is the permission
   of the write; the administration sees the customers of the installation in
   the edit page of the object and adds or removes the assignment. A customer
   that was registered by himself has no assignment until the administration
   gives him one — the assignment is a decision of the operator. A customer
   that reports a fault by QR code and registers in the same step becomes the
   trained person of that object at once (`specs/19-customer-portal.md`
   §19.6): the assignment is written in the same transaction as the report.
   The operator can remove the assignment later; the report keeps its
   reporter.

## Alternatives

- **A separate `customers` table with its own login.** Rejected: two places
  would hold a name and an address, the assignment would need a second
  mechanism, and the customer would need a second session and a second
  password handling for a person who is a user like every other one.
- **The customer as a group or a role assignment of the office.** Rejected: the
  assignment belongs to one object, not to a pool — the trained person of the
  installation X is not the trained person of the installation Y. A column
  `trained_user_id` on `objects` fails for the same reason: an installation
  can have several trained people.
- **A customer account without the role `customer`.** Rejected: the permission
  set of a customer is a fixed, small set; a role makes it visible in the
  administration and revocable without touching the user row.

## Consequences

- The role `customer` is a system role (`is_system`), it is seeded and its
  permission set is rewritten on every seed run (`specs/01-rbac.md` §3.5).
- The user administration lists a customer like every other user; the role
  picker carries `customer`.
- A customer sees only his own data: his open tickets and his objects. He
  never sees the internal comments, the internal entries of the history and
  the data of the other customers (`specs/19-customer-portal.md` §19.5).
- The deletion of a customer keeps his assignments and his tickets: the
  assignment and the ticket reference him with `ON DELETE SET NULL` and the
  ticket survives with its history.
