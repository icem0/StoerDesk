# ADR-0037: The recipient chooses the way of the escalation that names them

- Status: accepted
- Date: 2026-11-19
- Stakeholders: office, on-call technicians, administration

## Context

The escalation administration offers a `notify` action with a target — one
technician, a readiness pool or the assignees of the ticket — and, without a
target, the channels of the installation as the broadcast of the action
(`specs/07-escalation.md` §7.5). The target select of the administration carried
the empty entry „Kanäle der Installation“ next to the people: a list that
mixed the *who* of a message with the *how* of its delivery.

The office named the defect: „das ziel ist eine person, der übertragungsweg
eine andere geschichte! jeder kann selbst bestimmen unter /settings/notifications
über welchen weg eine benachrichtigung bei welcher art von nachricht bei ihm
verwendet werden soll.“

The implementation did the opposite of that model:

1. A `notify` action with a target was delivered over **ntfy only** — the
   dispatcher wrote one row per recipient on their own ntfy topic, and the
   administration could not choose another way.
2. Even that one way depended on the recipient: the resolver required a row of
   `notification_preferences` for the event type `ticket.escalated` and the
   channel `ntfy`. A technician who prefers Telegram or Web Push received
   **nothing**, and a technician who never touched the selection received
   **nothing** — silently, without a row in the ticket history.

The specification promised the third thing: §11.4 rule 1 said that „the
escalation rule of the admin decides the channels of `ticket.escalated` — the
selection of the user does not change it“. So the rule of the administration
decided nothing, the selection of the user decided everything, and the way the
office had chosen for itself — Telegram, Matrix, Web Push — was unreachable for
the escalation.

ADR-0033 decision 4 had already named the limitation honestly: „the per-user
routing of the other channels stays a named limitation“. The defect went
further: it was not a limitation of the routing, it was a silent loss of the
message.

## Decision

1. **The target answers the *who*, the selection of the recipient answers the
   *how*.** A `notify` action with a target delivers one row per recipient and
   per channel the recipient selected for `ticket.escalated` under
   `/settings/notifications`. The rule of the administration decides **whether**
   and **to whom** the escalation goes; the recipient decides **over which way**
   it arrives.
2. **Without a selection the recipient keeps their personal ntfy topic.** A
   recipient without a row for `ticket.escalated` receives the notification on
   their own ntfy topic — the personal fallback of ADR-0037; a recipient without
   an ntfy account receives nothing. The action never becomes a broadcast: a
   target addresses people, not the whole office.
3. **Without a target the action stays the broadcast of the installation.** The
   channels of the installation are the way of that action and the selection of
   the users does not change them. The administration sees this as a separate
   decision — the empty target means „no personal addressee“.
4. **The administration no longer chooses the way of a targeted action.** The
   channels of a `notify` action with a target are ignored by the dispatcher
   (they were already) and the administration does not offer them. The
   escalation editor separates the two decisions: the target select names a
   person, the channel select belongs to the broadcast.
5. **The rule of the administration loses its veto.** The selection of the
   recipient may not only switch a channel off — it decides the way, as it
   already does for the readiness events (ADR-0021).

## Alternatives

- **The administration chooses the way of the target** (the target stays, the
  channels stay). Rejected: it contradicts the model of §11.4 — the recipient
  decides the way of their own notification — and the office asked for exactly
  that separation.
- **The selection of the recipient may only switch the way off.** Rejected: the
  office wants its own way, not a veto over the way of the installation.
- **The broadcast as the fallback of a target without a selection.** Rejected:
  the target would address everyone; an escalation meant for one technician
  would wake the whole office.
- **Keep ntfy and drop the dependency of the selection.** Rejected: it keeps the
  wrong way — a technician with Telegram stays unreachable — and it contradicts
  the selection the page `/settings/notifications` offers.
- **A personal address for every channel** (Telegram, Matrix, WhatsApp, Web
  Push to the address of the recipient). Rejected for now: the routing of the
  personal address lives in the adapters of the channels and the drain, and it
  stays the named limitation of ADR-0033 decision 4. The decision of ADR-0037
  does not depend on it.

## Consequences

- The precedence of `specs/10-notifications.md` §11.4 changes: rule 1 no longer
  gives the channels of an escalation to the administration, and the selection of
  the user decides the channels of `ticket.escalated` whenever the action names
  a recipient.
- The dispatcher of the escalation writes one row per recipient and per selected
  channel; the resolver of the recipients replaces the ntfy-only lookup.
- A selected channel that is not configured ends the row as `FAILED` with the
  code `channel_unconfigured` — the same rule as every other row.
- The administration of the escalation names the empty target as the broadcast
  of the installation and no longer writes a channel list into a notify action
  with a target.
- The own page `/settings/notifications` names the rule: the selection decides
  the way, the escalation rule decides the recipient.
- The personal routing of the channels other than ntfy stays a named
  limitation: such a row of a recipient reaches the address of the installation.
