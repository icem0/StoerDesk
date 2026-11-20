# ADR-0038: The entries of the house in the ticket history are framed

- Status: accepted
- Date: 2026-11-20
- Stakeholders: office, on-call technicians, administration

## Context

The office read the history of a ticket and could not tell which rows belong to
the ticket and which rows are chatter of the house: „Benachrichtigung gesendet“,
„System“, „Eskalationsstufe: Neu“, the line „ntfy · Empfäng: … · Target: …“ and
an internal comment all sit in the same list as the workflow steps, with one
background block for the internal comment only. The office asked that **every**
entry which never leaves the house carries a frame in the colour it can define
for internal events and comments, so it is visible at a glance which entries are
internal.

ADR-0034 already named the internal comment as an event type of its own and put
its colour under „Darstellung“; the list `INTERNAL_TICKET_EVENT_TYPES` of
`packages/shared/src/schemas/ticket.ts` is the single place that names the
event types that never reach the customer, and the prepared send view filters
the history through it (WP-M14-149c). The escalation rows and the delivery rows
were never in that list — they were printed into the customer view beside the
workflow, with the channel, the addressee and the target of the installation.

## Decision

1. **The internal entries are the rows of the shared list.**
   `INTERNAL_TICKET_EVENT_TYPES` names the event types that stay in the house:
   `internal_comment`, `escalated`, `escalation_set`, `escalation_note`,
   `notification_sent`, `notification_failed`. The workflow steps
   (`review_started`, `assigned`, `offered`, `claimed`, `declined`, `reopened`,
   `cancelled`, …) and the steps of the pause (`paused`, `resumed`) stay outside:
   they are the story of the ticket, not the chatter of the house.
2. **The ticket view frames those rows.** Every history row of an internal
   event type carries a frame — a 2 px border of `rounded-lg` in the colour of
   the internal entries under „Darstellung“ (the field `internalCommentColor`
   of ADR-0034) beside a faint backdrop. The colour of the frame is the colour
   the administration already configures; no second colour and no new setting
   appear.
3. **One list, both consumers.** The same predicate `isInternalTicketEvent`
   frames the row in the ticket view and keeps the row out of the prepared send
   view. An escalation row, a firing and a delivery never reach the printout
   and never reach the e-mail of the customer — beside the internal comment,
   which ADR-0034 already kept out.
4. **The shape carries the meaning, not the colour alone.** The row keeps its
   localized event name („Interner Kommentar“, „Eskalations-Notiz“,
   „Benachrichtigung fehlgeschlagen“) and the frame is a shape, so the
   distinction stays readable in a screen reader and in a printed view
   (§14.2 accessibility).

## Alternatives

- **A list of the internal types inside the ticket view.** Rejected: ADR-0034
  names one list as „the single place that names them“; a second list would
  decide in two places what stays in the house.
- **A colour chip or a label „internal“ per row.** Rejected: the frame is the
  mark the office asked for, the row already names itself with its event type.
- **Framing every row that is not in `PUBLIC_TICKET_EVENT_TYPES`.** Rejected:
  that would frame the workflow steps of the office as well, and the office
  would not see the story of the ticket any more — it would see a wall of
  frames.
- **A new setting „colour of the internal entries“.** Rejected for now:
  `internalCommentColor` is already that colour, configured under „Darstellung“
  with its picker (WP-M16-06); a second field would offer two colours for one
  meaning. The label may be renamed when more surfaces use the frame.

## Consequences

- The customer printout and the copied e-mail lose the escalation and the
  delivery rows: a customer print names the story of the fault, not the people
  of the house. Names of technicians and channels stay out of an outgoing
  document.
- The ticket view frames internal rows in the colour of the Darstellung; an
  installation that never configured a colour frames them in the dark red
  default of ADR-0034.
- The public status page is untouched: it answers `PUBLIC_TICKET_EVENT_TYPES`
  and never knew the internal types.
- A new internal event type has to join the shared list — the frame and the
  filter of the send view follow the list, so no consumer has to remember it.
