# ADR-0056: The report of the reporter leaves the installation as an escalation action

- Status: accepted
- Date: 2026-11-25
- Stakeholders: office, customer

## Context

The reporter of a fault may ask to be informed: the report form of the QR code
offers the checkbox „Meldungen per E-Mail empfangen“. The question is **who
decides** what the customer receives and when.

The office already owns the answer for every other message of a ticket: the
escalation stages carry their actions, and every action is configured per
installation (`specs/07-escalation.md` §7.5, ADR-0023). The actions know the
office, the technician, a webhook and the history. A message to the reporter
that is written into the code would be a second place with a decision of the
installation — and it would send a mail at a moment that nobody configured.

## Decision

1. **The mail to the reporter is an escalation action.** The action type
   `notify_reporter` writes the report of the ticket to the address of the
   reporter. It is configured like every other action: in the stage, in the
   rule, with its condition — the office decides which stage informs the
   reporter and which condition has to hold.
2. **The customer decides whether he wants it.** The action is sent only when
   the ticket carries the opt-in of the reporter
   (`tickets.customer_email_notifications`). The opt-in belongs to the ticket:
   the reporter ticks the box in the report form, the office decides _what_ is
   sent, the reporter decides _whether_ it is sent at all. An opt-in that the
   customer did not give is never sent, and an action that the office did not
   configure is never sent.
3. **The mail carries the ticket and nothing of the house.** The body is the
   ticket mail of the mailbox of the instance (`customer_ticket`); it names
   the number of the ticket, the priority, the object and the state. The
   internal comments, the internal entries of the history and the data of the
   office never leave the installation (ADR-0034, ADR-0038).
4. **The address of the reporter is the only recipient.** The action needs no
   target: it writes to `tickets.reporter_email`. A ticket without an address
   or without the opt-in is skipped silently — the action is not an error.

## Alternatives

- **A fixed mail on every status change.** Rejected: the office decides when
  the customer is informed; a fixed mail informs the customer about states
  the office never wanted to publish. The opt-in alone does not decide
  either — then the content and the moment of the message would be fixed in
  the code.
- **The mail as a channel of the customer account.** Rejected: the reporter of
  a report is often no account at all; the address on the ticket is the
  address of the report.

## Consequences

- The action type `notify_reporter` joins the catalogue of the actions
  (`ESCALATION_ACTION_TYPES`) and the editor of the actions of the
  administration offers it.
- The action writes into the outbox of the installation, so the delivery is
  visible in the log of the deliveries like every other message.
- A ticket without the opt-in is never mailed, even if the office configured
  the action — the opt-in of the reporter wins over the configuration.
