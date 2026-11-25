# ADR-0061: The QR code leads to the open ticket of the object

## Context

A reporter scans the QR code of an object (a lift, a fire alarm system, a
ventilation). Today the scan opens the report form at `/m/:token` and the
reporter sees the **form** — the open ticket of the object exists only as a
notice in the form (§7.8 of `specs/06-report-form.md`): the number, the status
and the time. The reporter who scans the code a second time — because the
fault is not gone — has to read that notice, click „Ergänzen“ and hope that the
button does what its name says.

The customer has the same problem in the portal: `/portal/tickets` lists the
**open** tickets of the customer, but there is no landing page of its own, no
rule for the case of exactly one open ticket, and a customer who signs in
through the ordinary login of the office lands in the internal application
instead of in his own portal.

Two rules of the repository were in the way:

- **SEC-004** (implemented in `apps/api/src/tickets/duplicates.ts`): only the
  reporter who holds the `status_token` of a ticket may comment on it. The
  token of an object never reaches a foreign ticket, so the code on the wall
  cannot extend a report of somebody else.
- **The append-only history** (`PLAN.md` §6): a comment is an event, never an
  edit of the ticket.

## Decision

1. **The scan shows the open ticket first.** `/m/:token` becomes the landing
   page of the code: it names the object, lists its open tickets — the newest
   one first — and the report form moves to `/m/:token/neu`. A second tap
   reports a new malfunction; the open ticket stays the main thing on the
   screen. Without an open ticket the landing offers the report directly.
2. **The public view of a ticket of the object is a narrow one.**
   `/m/:token/tickets/:ticketNo` shows the number, the status, the reported
   time, the deadline, the **public** events of the status
   (`PUBLIC_TICKET_EVENT_TYPES`) and the public comments of the ticket. It
   never shows the description, the contact of the reporter, the photos or an
   internal entry (ADR-0034, ADR-0038). The answer of the API is a contract
   of its own (`publicObjectTicketSchema`), so the narrowness is a rule of the
   server and not of the page.
3. **The object QR is the capability for a comment on an open ticket of that
   object.** `POST /api/v1/public/objects/:token/tickets/:ticketNo/comments`
   writes one append-only event `type = 'comment'` with
   `payload.source = 'object_qr'`. The ticket must belong to the object of the
   token and must still be open. SEC-004 keeps its force for the path of the
   `status_token`: a comment on a ticket of another object stays `403`.
   The comment reaches the office like every comment, but the **public** view
   of the ticket shows the text without the contact data of the author.
4. **The customer has a landing page of his own.** `/portal` is the landing
   page of the portal, `/portal/tickets` stays as its address. The list shows
   the **open** tickets first and the closed ones below. **Exactly one open
   ticket** opens its detail directly — the customer does not have to click
   his way to the one thing that is open. A customer who signs in lands in
   his portal, never in the internal application of the office.

## Consequences

- The office sees where a comment came from: the payload of the event names
  `object_qr`, so a comment of a second visitor is distinguishable from the
  comment of the reporter of the ticket.
- A ticket of an object can be extended by everybody who holds the code of
  that object. That is the price of the decision and it is bounded: the code
  is printed on the object, the comment is append-only, the ticket must be
  open, the spam limit of §7.6 applies and the contact data of the author
  never leaves the house.
- The number of a ticket is not a secret of the object: the open tickets of an
  object were already listed with their number, their status and their time
  (§7.8.1). The new view adds the deadline and the public events — no more.
- The landing page of the code and the report form are two addresses now. The
  sticker keeps its address (`/m/<token>`), so the code on the wall needs no
  new print.

## Amends

- `specs/06-report-form.md` §7.8 — the duplicate hint stays, but the scan
  leads to §7.9 (the landing page of the code).
- `specs/06-report-form.md` §7.8.2 — SEC-004 stays for the `status_token`;
  the object QR gains its own path (§7.9.3).
- `specs/19-customer-portal.md` §19.5 — the portal gains its landing page.
