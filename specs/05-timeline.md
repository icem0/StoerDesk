# 05 — Timeline and pauses

**Chapter:** 6 (timeline) with the pause addendum of `PLAN.md` §9
**Scope:** ~80 lines
**Status:** reviewed for phase 6 (WP-M6-01)

The binding summary is `PLAN.md` §9. This slice details the timeline of a
ticket, its pause clock and the representation the API and the web app share.

## 5.1 One interval per ticket

A ticket shows a horizontal bar from `reported_at` to `deadline_at`. The
deadline is computed from the trusted report time and the **per-priority**
deadline length; the defaults are ADR-0008:

| Priority | Hours | Rationale |
| --- | --- | --- |
| `low` | 168 | planned work within a week |
| `normal` | 72 | the default of `PLAN.md` §9 |
| `high` | 24 | same-day handling |
| `critical` | 8 | immediate handling, but not an emergency path |

The calculation is `deadline_at = base + hours`, where `base` is the trusted
timestamp the report path already uses (`reported_at`, or `received_at` when the
device clock was skewed). QR reports are always `normal`; only internal reports
choose another priority (`PLAN.md` §10). The values are the fallback of the
`settings` rows `ticket.deadline_hours.<priority>` when such a row is a positive
number — the database stays authoritative for an installation that overrides
them later.

## 5.2 Pauses and the pause clock

A wait reason pauses the clock while the office waits for a third party. The
pause lives in `ticket_pauses` and is reported separately in statistics
(`PLAN.md` §9, §13).

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `ticket_id` | UUID, not null | foreign key to `tickets`, `ON DELETE CASCADE` |
| `reason` | text, not null | trimmed wait reason, 3–500 characters |
| `started_at` | timestamptz, not null, default `now()` | server clock |
| `ended_at` | timestamptz, nullable | `NULL` while the pause is open |
| `started_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `ended_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `created_at` | timestamptz | as §4.2 |

A partial unique index `ticket_pauses_one_open_per_ticket` on `ticket_id WHERE
ended_at IS NULL` guarantees at most one open pause per ticket. A pause starts
only while the ticket is neither `ACKNOWLEDGED`, `CLOSED` nor `CANCELLED`; a
second start answers `409 pause_already_open`. Ending without an open pause
answers `409 pause_not_open`. Acknowledge, close and cancel end an open pause
automatically with the acting user, so no stale pause outlives the stop of the
timeline.

Starting writes one `paused` event, ending one `resumed` event, both with
`actor_kind = 'user'` and `payload = { reason }` on start. The events are the
audit trail of the clock.

## 5.3 Calculation and colours

The timeline is measured in milliseconds:

- `total_ms = deadline_at − reported_at`;
- `paused_ms` is the sum of all closed pauses plus the running part of an open
  pause, capped at the measured interval;
- `elapsed_ms = (stopped_at ?? now) − reported_at − paused_ms`, floored at 0;
- `remaining_ms = max(0, total_ms − elapsed_ms)`;
- `percent = min(100, elapsed_ms / total_ms × 100)`.

`stopped_at` is `acknowledged_at` when it is set; the bar stops there
(`PLAN.md` §9). `CLOSED` and `CANCELLED` also report `state = 'stopped'`.

| `state` | Condition |
| --- | --- |
| `green` | `percent < 50` |
| `yellow` | `percent >= 50` and `< 80` |
| `orange` | `percent >= 80` and `< 100` |
| `red` | `remaining_ms = 0` before acknowledgement |
| `stopped` | the timeline stopped at acknowledgement or the ticket is closed/cancelled |

Markers come from the append-only events and are never authoritative times of
their own: report (`created`), office review (`review_started`), work order
(`work_order_set`), accept (`accepted`), acknowledge (`acknowledged`). The
server computes the timeline in the API answer; the client recomputes it every
minute from the same shared function, so a phone with a wrong clock never
becomes the source of truth.

## 5.4 API representation

`GET /api/v1/tickets/:ticketNo` answers a `timeline` object in addition to the
ticket and its history:

```json
{
  "reportedAt": "…",
  "deadlineAt": "…",
  "stoppedAt": null,
  "pausedMs": 0,
  "totalMs": 259200000,
  "elapsedMs": 3600000,
  "remainingMs": 255600000,
  "percent": 1.39,
  "state": "green",
  "pause": null,
  "markers": [{ "type": "created", "at": "…" }]
}
```

`pause` is `{ id, reason, startedAt }` while a pause is open, otherwise `null`.
`GET /api/v1/tickets` carries `timelineState`, `percent` and `remainingMs` per
row for the mini timeline. With `order=deadlineAt` the list sorts by the
deadline in the requested direction and puts the open tickets before the
finished ones, so the least remaining time is on top (`PLAN.md` §9, WP-M9-20).
