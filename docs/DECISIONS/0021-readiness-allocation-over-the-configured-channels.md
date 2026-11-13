# ADR-0021: The allocation of the readiness speaks to the technician over the configured channels

- Status: accepted
- Date: 2026-11-13
- Stakeholders: office, on-call technicians, administration

## Context

The office complained twice about the readiness: an assigned readiness cannot be
accepted, and the allocation of a shift to a technician is silent. The technician
only sees the readiness page when the browser already knows it — a technician who
was allocated a shift for next week learns it nowhere.

Phase 8 named the boundary in `specs/04-oncall.md` §4a.9 ("No notification
delivery in this phase") and `specs/10-notifications.md` §11.4 fixed the event
types as the four `ticket.*` ones. The `outbox` table has one column less than
§11.10 promises: `ticket_id` is `NOT NULL` with a cascade FK, so a row without a
ticket is impossible, and there is no `event_type` column. `notification_preferences`
checks its `event_type` against the four ticket events.

An admin who assigns a technician creates a `DRAFT` shift; only a `PLANNED` one
can be confirmed (`specs/04-oncall.md` §4a.4). The technician therefore sees
their own readiness on `/oncall` without an accept button and has to hope that
the admin pressed "publish".

## Decision

1. **Three readiness event types join the notification events**:
   `oncall.assigned` (the allocation of a technician to a shift),
   `oncall.swap_requested` (an open swap on the own confirmed shift) and
   `oncall.unconfirmed_reminder` (a shift that still waits for a decision
   `oncall.reminder_unconfirmed_h` before it starts). Migration `0034` widens
   the `notification_preferences` event check to the seven types.
2. **The outbox carries a shift next to a ticket** (the column §11.10 promised,
   now with its shift sibling): `event_type` (text, check over the seven types,
   default `ticket.created` for the rows written before this decision), `shift_id`
   (FK to `oncall_shifts`, `ON DELETE CASCADE`, nullable) and `ticket_id` becomes
   nullable with the check that exactly one of the two is set. A readiness row is
   written in the transaction of the on-call write, never in a channel call.
3. **The selection of the user decides the readiness events** exactly like the
   three user-decided ticket events: one row per `(user_id, event_type, channel)`
   in `notification_preferences`; without a row the channel chain of §11.1 is
   used. The mandatory minimum channels of §11.9 stay `critical`-ticket-only —
   the admin cannot force a readiness message onto every channel.
4. **The allocation announces itself**: assigning a technician to a shift
   (`POST /api/v1/oncall/shifts`, `PATCH /api/v1/oncall/shifts/:id`) enqueues one
   row per selected channel of the technician with the event `oncall.assigned`;
   requesting a swap enqueues `oncall.swap_requested` for the requesting
   technician and for a named target colleague. The reminder is enqueued by the
   per-minute escalation scan for a `PLANNED` or `DRAFT` shift that starts within
   `oncall.reminder_unconfirmed_h` and has no `oncall.unconfirmed_reminder` row
   yet — idempotent per shift, one reminder per shift.
5. **A technician can accept their assigned readiness**: a `DRAFT` shift is
   confirmable (`DRAFT --technician confirm--> CONFIRMED`), so the acceptance
   publishes the shift the admin assigned. An admin assignment without a
   technician stays `UNFILLED` and a planned generation stays `PLANNED` as before;
   the publish action of the admin page stays for shifts nobody was assigned to.
   `DRAFT` still never counts for ticket coupling until it is confirmed or
   published.
6. **The message of a readiness event** names the pool, the start and the end in
   `Europe/Berlin`, the state of the shift and the deep link to `/oncall`; it
   carries no ticket fields, no photos and no contact data of a reporter.

The contract is `specs/04-oncall.md` §4a.3, §4a.4, §4a.9 and
`specs/10-notifications.md` §11.4, §11.7, §11.10, §11.12, §11.14.

## Alternatives

- **A separate readiness inbox inside the web app.** Rejected: the office asked
  for the messenger channels, and a second delivery mechanism would duplicate the
  retries, the fallback chain and the failure warning.
- **Announce only `PLANNED` shifts, never a `DRAFT` allocation.** Rejected: the
  complaint is exactly about an allocation that is not published; the
  allocation is what the technician must be told about.
- **Confirmable DRAFT plus a `PUBLISHED` confirmation state.** Rejected: a fifth
  state moves the state machine of phase 8 without a need — the technician's
  acceptance is already the publish of their own shift.
- **Admin-defined channels for the readiness instead of the user selection.**
  Rejected: the technician chooses their channels (§11.4) and the instance chain
  already covers an instance without any selection row.

## Consequences

- The outbox worker must build a readiness message for a shift row and must never
  treat a shift row as a ticket row.
- Widening the preference check needs a migration over an existing table; rows of
  a running instance are unaffected, no row is rewritten.
- The acceptance of a `DRAFT` readiness publishes it, so an admin who assigned a
  technician no longer has to publish before the technician acts.
- A reminder row per shift makes a repeated scan cheap and keeps one row per shift
  even when the shift moves.
- The `notification_preferences` UI (WP-M14-17) and the escalation of a critical
  ticket stay independent: the readiness events are not part of
  `notifications.minimum_channels`.
