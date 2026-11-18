# ADR-0034: The internal comment never leaves the office

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office

## Context

The office writes a comment on a ticket, and the comment travels to the customer:
the prepared send view (`/tickets/:ticketNo/send`) renders the whole history of
the ticket, prints it as PDF and copies it as HTML into the e-mail program. The
office needs a second kind of comment: a note for the colleagues — about the
customer, about the technician, about the next step — a note that must never be
printed and never sent to the customer. Such a note also has to be recognisable
at a glance, so it gets its own colour in the ticket view.

The permission question comes with it: a note that stays in the house is a
deliberate decision of the office, so it gets its own key, which the
administration grants to the colleagues who may write it.

## Decision

1. **The internal comment is its own event type.** `ticket_events.type =
   'internal_comment'` with the payload `{ text }` — the same shape as a normal
   comment. The type column carries no check constraint, so the event type needs
   no migration (`specs/02-data-model.md` §4.9). The event is append-only like
   every other event of the trail.
2. **Its own permission key.** `ticket.comment.internal` in the catalogue
   (`packages/shared/src/permissions.ts`). The key belongs to **no default
   role** — the administration grants it to a role or to a colleague; `admin`
   holds it through the catalogue. The rule of `notification.read_all`
   (`specs/01-rbac.md` §3.3) applies. The only enforcement point is the server:
   `POST /api/v1/tickets/:ticketNo/comments/internal` behind
   `requirePermission(database, PERMISSIONS.ticket.comment.internal)`. A route
   with a flag in the body would not work — `requirePermission` has OR
   semantics, so the key has to be a route of its own.
3. **It never reaches the customer.** The prepared send view leaves the
   internal comments out of the history: they are neither printed nor copied
   into the e-mail. The public status page (`specs/06-report-form.md` §7.3.4),
   the webhooks and the notification outbox never carry them either — the
   internal comment is an event of the trail like every other one, but no
   outgoing path knows it.
4. **The colour is a setting of the Darstellung.** The colour of the internal
   comment — the background of the field and of the entry in the history — is a
   hex value the administration sets under „Darstellung“ (the branding page);
   the default is a dark red (`#7f1d1d`). The ticket view reads it from
   `GET /api/v1/settings/display` (`ticket.read`): every user who sees a ticket
   may read a presentation value, so the colour does not need `settings.read`.
5. **The write stays offline-capable.** The internal comment joins the three
   internal writes of the outbox (`specs/09-offline.md` §9.6): the queue carries
   the kind `internal_comment`, the replay posts it to its own route. An
   internal comment must never be queued as a normal comment — a normal comment
   is printed.

## Alternatives

- **A flag in the payload of the normal comment.** Rejected: the flag travels
  through every consumer of the trail, and each of them would have to remember
  it. An event type cannot be forgotten by a filter.
- **A separate table of the notes.** Rejected: the trail of the ticket is
  append-only and complete; a second table would need its own trail, its own
  deletion and its own export.
- **The key in the default roles.** Rejected: a note that never leaves the
  house is a deliberate decision of the office. A colleague receives it by an
  explicit grant, not by a role he happens to have.
- **The colour as a Tailwind class.** Rejected: a class is compiled into the
  bundle, so a new colour would need a new build. A hex value in the settings
  is a value of the instance.
- **The colour in the branding row without a route of its own.** Rejected: the
  branding row is behind `settings.read`, and a colleague without that
  permission would see the default colour instead of the configured one.

## Consequences

- The office separates the two kinds of comment in the field: the normal
  comment goes to the customer with the prepared send view, the internal comment
  stays in the history of the ticket and in the house.
- The note is visible for every colleague who may read the ticket — the
  permission guards the **write**, not the read. A colleague who may not write a
  note still sees the notes of the others.
- The guarantee „never printed, never sent“ is a rule of the send view and of
  the event type, not a rule the office has to remember.
- The colour is a value of the instance: a new installation shows the dark red,
  an administration can change it under „Darstellung“.
