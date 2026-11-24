# ADR-0046: The mailbox of the instance — HTML mail with a template per kind of message

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, administration

## Context

The e-mail channel of StörDesk was the least finished channel of the layer:

- the adapter sent **without a recipient** (`sendMail({ from, subject, text })`)
  — a mail that no mail server accepts,
- the body was **plain text** — the office named the ticket link in the mail a
  must: „eine reine text e-mail kommt nicht in frage“,
- the configuration of the administration was **inert**: the row of
  `notification_channels` was never read by the send path, only the
  `SMTP_*` variables of the environment,
- there was **no template**: every text was fixed in the code of the outbox,
- there was **no mailbox**: no sender name, no recipient of the broadcast, no
  test address, no log of the deliveries.

The broadcast of an escalation named the channels of the installation — for
e-mail that meant a channel without a destination.

## Decision

1. **The mailbox is administered in `/admin/email`.** The page holds the SMTP
   connection (host, port, TLS, user, write-only password), the sender
   (address and display name), the templates of the messages, the base address
   of the deep link, the test mail and the log of the deliveries.
2. **The row wins over the environment.** The configuration of the page lives
   in the row of `notification_channels` and replaces the `SMTP_*` values of the
   environment as a whole — the same rule as the VAPID trio of §11.2.
3. **The mail is HTML.** The body of every mail is HTML with the ticket link as
   a clickable link; a plain text mail is never sent.
4. **A template per kind of message.** The kinds are the ticket message, the
   readiness message and the test message. A template is a plain text with the
   placeholders `{ticket_no}`, `{priority}`, `{object}`, `{location}`,
   `{system_type}`, `{text}`, `{aa_sa}` and `{url}`; the server renders it as
   HTML (paragraphs, escaped values, the link as a link). A kind without a
   template uses the built-in default.
5. **The broadcast goes to the addresses of the users.** A broadcast of the
   installation (a `notify` action without a target) reaches the users of the
   instance over their mail address; a personal message reaches the confirmed
   address of the user.
6. **Every delivery leaves a trace.** The last deliveries of the mailbox are
   shown with the time, the recipient and the result — the mail path is the
   only channel whose failure is invisible otherwise.

## Alternatives

- **A template in HTML written by the admin.** Rejected: the admin writes a
  plain text, the server escapes the values and builds the HTML — a template
  of the administration cannot break the mail.
- **A separate table of templates.** Rejected: the templates belong to the
  channel — the jsonb of the row of the channel is their home.
- **The broadcast goes to a list of addresses of the administration.** Rejected:
  the office is the list — the users of the instance are the recipients.
- **Plain text with the link as a URL.** Rejected: the office named the HTML
  mail a must.
