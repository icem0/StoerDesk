# ADR-0055: The ticket carries the customer — the trained person of the object is selectable

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, customer

## Context

A ticket names its reporter as free text (`tickets.reporter_name`,
`tickets.reporter_phone`, `tickets.reporter_email`). The office wants the
ticket to name the **customer** — the trained person of the object — so that

- the customer finds his report in the portal of the customer,
- the office sees at the ticket that the reporter is the trained person of the
  installation,
- the report that was made by QR code and registered in the same step belongs
  to the customer right away.

Two paths lead to a ticket of a customer: the report by QR code (the customer
registers in the same step) and the internal creation of a ticket (the office
names the customer).

## Decision

1. **The ticket carries the customer.** The column `tickets.customer_user_id`
   references a user and is nullable. A ticket without a customer is normal:
   a report of a passer-by, an internal ticket, a report of an installation
   without a contract (`OHNE-OBJEKT`).
2. **The customer of a ticket is chosen from the trained people of the
   object.** The internal creation of a ticket offers the assignments of the
   object (`object_assignments`) and writes the chosen customer into
   `customer_user_id`. The report form of the QR code writes the customer of
   the registration into the same column — the object of the QR token and the
   customer belong together.
3. **The customer is not the reporter.** The reporter stays free text on the
   ticket; the customer is the account. A report may name a contact that is
   not the customer (`reporter_kind` stays as it is), and the customer of the
   ticket may not be the reporter of the ticket.
4. **The customer of a ticket is never removed with the customer.** The
   reference is `ON DELETE SET NULL`: a deleted customer leaves his tickets
   with their history, and the tickets of the other customers are untouched.
5. **Only the customer of the ticket and the office see the ticket.** The
   portal of the customer answers the tickets whose `customer_user_id` is the
   signed-in user; the internal routes stay behind their permissions.

## Alternatives

- **A separate table `ticket_customers`.** Rejected: a ticket has at most one
  customer; a second table would carry a one-to-one relation that the
  column expresses directly.
- **The reporter becomes the customer automatically.** Rejected: the reporter
  of a ticket is often a passer-by or a colleague of the office; the trained
  person is a decision of the operator.
- **The customer is derived from the object.** Rejected: an object may have
  several trained people, and the ticket belongs to the person who reported,
  not to the object.

## Consequences

- The list of the tickets needs the customer as a column of the answer, and
  the portal of the customer filters on it.
- The customer of a ticket is a name of the account — no contact data of the
  customer is written into the ticket.
- A report that was made by QR code and registered in the same step is
  visible in the portal of the customer as soon as the customer confirmed his
  registration.
