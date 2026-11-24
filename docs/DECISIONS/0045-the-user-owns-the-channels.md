# ADR-0045: The user owns the channels, the administration names the required ones

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, on-call technicians, administration

## Context

The notification layer carried a **selection of the channels per event type**
(`notification_preferences`, one row per `(user_id, event_type, channel)`). The
settings page showed seven event types and, per event type, a checkbox per
configured channel — the "way of a message" was chosen seven times.

The office named the defect:

1. **The choice is made twice.** A user who wants Telegram for a new ticket
   wants it for the escalation and for the readiness as well. Seven switches
   for one decision is a decision nobody makes correctly.
2. **A missing choice is not a choice.** §11.4 made a user without a row fall
   back to the channels of the instance — the selection was silent. A user who
   never opened the page was notified the way the installation was, not the way
   they wanted.
3. **The important thing is not the channel but the reach.** The office cares
   that a technician is really reached — not which of seven event types carries
   which channel. A user with a dead phone, a broken mailbox and no second
   device was "configured" for the office and unreachable in fact.

The readiness of a user is therefore a question of **how many ways reach the
user**, not a question of seven switches. The administration needs to say what
it expects of a user; the user needs to be reachable.

## Decision

1. **A user has channels, not a selection per event.** The channels of a user
   are the accounts he linked (`notification_accounts`) and the devices he
   registered (`push_subscriptions`). Every event goes over these channels.
   `notification_preferences` and its routes are removed.
2. **A channel counts only when it is confirmed.** A linked account is
   *linked*; it is *set up* only when the user proved that the address works:
   the server sends a one-time code over that very channel and the user enters
   it. `notification_accounts.verified_at` carries the proof. The code is the
   same mechanism for every channel — ntfy, Telegram, Matrix, e-mail, Web Push
   and WhatsApp Web.
3. **The administration names the required channels.** The setting
   `notifications.required_channels` names the channel kinds every user must
   have set up, and `notifications.minimum_channel_count` names how many
   channels a user must have set up in total. A user *fulfils* the rule when
   every required channel is set up **and** the number of set-up channels
   reaches the minimum.
4. **Signal is not a required channel.** Signal has no address of the user; it
   is a channel of the installation. It may never be named as a required
   channel — a requirement that no user can fulfil is a lie in the
   administration.
5. **The rule warns, it never blocks.** A user who does not fulfil the rule
   sees a permanent warning on his own page with a link to the setup; the
   administration sees the list of the users who do not fulfil it. Nothing is
   blocked: no login, no assignment, no delivery.
6. **The delivery falls back to the channels of the instance.** A message to a
   user goes over the set-up channels of that user. If the delivery over them
   fails, the chain of the installation answers — a message is never lost
   because one address is broken.
7. **The administration sees the channels of every user.** The administration
   shows which channels every user has set up — the state of the channel, not
   the address of the user: no topic, no chat id, no mail address, no secret.

## Alternatives

- **Keep the selection per event type and add the rule on top.** Rejected: the
  defect of the office is the seven switches themselves; a rule on top of them
  would multiply the confusion instead of removing it.
- **The administration forbids a user without channels (no login).** Rejected:
  the office named the warning with a link as the wanted behaviour; a locked
  account during a fault of the mail server would take the whole office out.
- **A channel counts as set up without a confirmation.** Rejected: a mistyped
  address, a revoked token and a deleted phone are all "linked" — the
  confirmation is the only thing that says the message arrives.

## Consequences

- The state of a channel of a user is `linked`, `set up` or `missing` — three
  states the interface shows with a symbol and a colour.
- The instance-level target of a channel (the room of the configuration, the
  chat of the configuration) stays the fallback of the installation.
- The personal routing of the channels other than ntfy becomes real: the
  message of a user goes to the address of that user (the named limitation of
  ADR-0033 decision 4 ends here).
- The e-mail channel needs the recipient it never had and an HTML body (§11.5).
