# 11 — Dashboard

**Chapter:** 12
**Scope:** ~120 lines
**Status:** reviewed for phase 9 (WP-M9-01)

The binding summary is `PLAN.md` §13. This slice details the live dashboard,
its snapshot contract, the fault-free counter and record, the tiles, the
"burning now" list, the Server-Sent-Events stream, the token-protected wall
display and the dashboard settings. The decisions behind it are ADR-0012.

## 11.1 Purpose and permissions

The dashboard is the start page `/` of the guarded shell. It answers the
questions an office needs at a glance: how long has it been calm, what is open,
what is overdue, who is on call, and are the notification channels working.

| Surface | Permission |
| --- | --- |
| `GET /api/v1/dashboard`, `GET /api/v1/dashboard/stream` | `ticket.read` |
| on-call tile inside the snapshot | `oncall.read` |
| channel tile inside the snapshot | `notification.read` |
| `GET/PUT /api/v1/settings/dashboard` | `settings.read` / `settings.write` |
| `GET /api/v1/tv/:token` | the token, no session |
| statistics (`specs/12-stats.md`) | `stats.read` / `stats.export` |

A snapshot never fails because an optional section is not permitted: the
section is `null` instead, so a `reporter_internal` still sees the ticket tiles
and the counter.

## 11.2 Snapshot

`GET /api/v1/dashboard` answers one object, computed in the database:

```ts
type DashboardSnapshot = {
  generatedAt: string                 // ISO UTC
  faultFree: {
    since: string | null              // last qualifying report, null when none
    days: number                      // whole local days since `since`
    recordDays: number                // longest fault-free period ever
  }
  tiles: {
    open: number
    openByStatus: Record<TicketStatus, number>
    overdue: number
    unreviewed: number                // status NEW
    poolSize: number                  // OFFERED without assigned technician
    onCall: null | {
      kind: 'confirmed' | 'planned' | 'unstaffed'
      name: string | null
      phone: string | null
      endsAt: string | null
      warning: 'oncall_unconfirmed' | 'oncall_unstaffed' | null
    }
    channels: null | Array<{
      name: string
      lastSentAt: string | null
      lastFailedAt: string | null
      pending: number
      failed: number
    }>
  }
  burningNow: Array<{
    ticketNo: string
    objectName: string
    status: TicketStatus
    priority: TicketPriority
    deadlineAt: string
    reportedAt: string
  }>
}
```

`burningNow` is the open, non-cancelled, non-test list ordered by
`deadline_at` ascending, limited to the ten nearest deadlines. It is read by the
wall display (§11.7), not by the start page. The on-call tile
reuses `resolveOnCallPerson` of `specs/04-oncall.md` §4a.6; `phone` comes from
the user contact data and is never part of the wall display.

## 11.3 Fault-free counter and record

A qualifying report is a ticket with `is_test = false`, `suspected_spam = false`
and `status <> 'CANCELLED'`. `since` is the `reported_at` of the newest
qualifying ticket; the counter shows the whole local days from `since` to now.
When no qualifying ticket exists, `since` is null and the counter shows "keine
Störung seit Inbetriebnahme".

The record is computed, never stored: `recordDays` is the longest gap between
two consecutive qualifying tickets in report order, and a still-running gap
counts while it is the longest. A new report therefore resets the counter and
can raise or leave the record, exactly as `PLAN.md` §20 item 8 requires.

## 11.4 Tiles

- `open`: every status except `CLOSED` and `CANCELLED`, split by status in
  `openByStatus`.
- `overdue`: open tickets with `deadline_at < now`.
- `unreviewed`: tickets still `NEW`.
- `poolSize`: `OFFERED` tickets without an assigned technician — the claimable
  pool of `PLAN.md` §7 step 4.
- `onCall`: `resolveOnCallPerson(database, { at: now })`, labelled with the
  warning of `specs/04-oncall.md` §4a.6.
- `channels`: one row per channel that appears in `outbox`, with the last
  `SENT` and last `FAILED` time and the pending/failed counts. A channel with a
  `FAILED` row newer than its last `SENT` row is shown as failing; the admin
  warning of `PLAN.md` §12 uses that flag.

## 11.5 Burning now

The list shows `ticketNo`, object name, status, priority and the absolute
deadline; the web renders the remaining or overdue time and the mini timeline of
`specs/05-timeline.md` §5.4 from the same fields. It links to the ticket detail.

The list belongs to the wall display (§11.7), not to the start page: the
dashboard of the office ends with the tiles and the counter, the deadlines live
in the ticket list behind the tiles (WP-M9-19). Every tile of the start page is
one link over its whole area.

## 11.6 Live updates (Server-Sent Events)

`GET /api/v1/dashboard/stream` is an authenticated `text/event-stream`:

- on connect it sends `event: dashboard` with one snapshot;
- a server-side probe runs every five seconds and compares the newest
  `updated_at` of `tickets`, `outbox`, `oncall_shifts`, `ticket_pauses` and
  `settings` with the value of the last send; a change sends a fresh snapshot;
- `event: heartbeat` every 25 seconds keeps proxies from closing the stream;
- a closed stream is reopened by the browser's `EventSource`.

The probe is a single indexed max query per table, not a database
`LISTEN/NOTIFY` channel. When `EventSource` is unavailable the web falls back to
a 30-second refetch of the snapshot; the dashboard works in both modes.

## 11.7 Wall display `/tv/:token`

The wall display is a full-screen page outside the guarded shell with large
tiles, the fault-free counter and the burning-now list, but no contact data and
no navigation.

`dashboard.tv_token` in `settings` is a random 32-byte `base64url` value. The
admin page shows it, copies it and rotates it; a rotated token invalidates every
open wall display immediately. `GET /api/v1/tv/:token` compares the token with a
timing-safe comparison and answers `404 tv_not_found` otherwise. The page polls
the endpoint every 15 seconds — SSE needs a session cookie, which a wall display
does not have.

`dashboard.tv_anonymize` (default `false`) replaces every object name with a
stable pseudonym derived from the object id, while ticket numbers, statuses,
priorities and deadlines stay visible. `dashboard.tv_token` and the flag are the
only dashboard settings; they are not part of the shared user preferences.

## 11.8 Administration

`/admin/dashboard` shows the TV token with copy and rotate actions, the
anonymisation switch and the conspicuous threshold of
`specs/12-stats.md` §12.6. It writes `GET/PUT /api/v1/settings/dashboard`
(`settings.read`/`settings.write`); the token is never logged, never answered
by a public route except through its own verification, and never leaves the
server in a metric.

## 11.9 Boundaries

- The snapshot is read-only; it never writes a ticket, a channel or a shift.
- No materialized view and no client-side aggregation — the SQL views of
  `specs/12-stats.md` §12.7 own every count (`PLAN.md` §13).
- No chart library and no additional dependency; the tiles and charts are plain
  SVG and CSS.
- Push or e-mail delivery stays in `specs/10-notifications.md`; the dashboard
  only reads the outbox state.
- The full export is CSV only (`specs/12-stats.md` §12.8); no PDF and no
  scheduled report.
