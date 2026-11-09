# ADR-0012: Dashboard live updates, statistics queries and wall-display access

- Status: accepted
- Date: 2026-11-09
- Stakeholders: office, manager, admin, operations

## Context

`PLAN.md` §13 fixes the dashboard and statistics scope, but leaves several
implicit points that a work package cannot decide silently: how "live" updates
reach the browser, whether statistics use views or materialized views, where the
longest fault-free record lives, how a wall display proves access without a
session, how test tickets are recognised, and how the charts are drawn without
adding a UI dependency.

`PLAN.md` §15 requires all server times in UTC and display in
`Europe/Berlin`; the timeline of §9 already stops at `ACKNOWLEDGED`. The
statistics therefore need a single, documented time base and a clear
compliance definition.

## Decision

1. **Live updates over Server-Sent Events with a polling probe.** The dashboard
   route `GET /api/v1/dashboard/stream` sends one snapshot on connect and a new
   snapshot when a five-second server-side probe sees a newer `updated_at` in
   `tickets`, `outbox`, `oncall_shifts`, `ticket_pauses` or `settings`. A
   25-second heartbeat keeps proxies open. There is no `LISTEN/NOTIFY` channel
   and no extra process: one indexed max query per table per open stream is
   cheaper than a second connection and an event fan-out in this stack.
2. **Plain SQL views, no materialized view in phase 9.** `stats_tickets` and
   `stats_ticket_faults` are ordinary views over the live tables. The volume of
   a fire-alarm desk does not justify the refresh lag and the refresh job of a
   materialized view, and "never load all tickets into the client" is already
   satisfied by aggregating in the database. A materialized view can be added
   later without changing the API shape.
3. **The fault-free record is computed, not stored.** The record is the longest
   gap between two consecutive qualifying reports, computed from the ticket
   sequence. A stored counter would have to be maintained by every create,
   cancel and purge path and could drift; the gap query cannot.
4. **The wall display uses a stored random token.** `dashboard.tv_token` is a
   random 32-byte `base64url` value in the existing `settings` table, generated
   and rotated from `/admin/dashboard`. `GET /api/v1/tv/:token` verifies it with
   a timing-safe comparison and answers `404 tv_not_found` otherwise. Unlike the
   stateless iCal token of ADR-0011 this token must be revocable without
   rotating `SESSION_SECRET`, because a wall display hangs in a shared room.
5. **Test tickets carry `tickets.is_test`.** A boolean column, default `false`,
   marks test data; the reference-data seed of the phase-9 exit test sets it
   explicitly, and phase 9 adds no user-facing toggle. The fault-free counter
   and the statistics exclude it by default. Suspected spam is a separate flag
   and is excluded by its own switch, so test data and spam never share a
   mechanism.
6. **Charts are inline SVG and CSS; no chart dependency.** The API answers
   aggregated series, and the web draws bars and lines with plain `<svg>` and
   Tailwind classes. This keeps the bundle small and avoids a library that has
   to be kept compatible with React 19.
7. **The conspicuous threshold is a setting.** `stats.conspicuous_threshold`
   defaults to `3` and is evaluated over the 90 days before the range end,
   independent of the selected range; the flag never hides a row.
8. **Pauses stay separate.** Reaction times are raw wall-clock durations; the
   pause count and pause minutes are reported next to them, exactly as
   `PLAN.md` §9 says ("pauses reported separately"). Subtracting pauses from
   each phase would double-count overlapping pauses.

## Alternatives

- **Polling the snapshot every five seconds from the client:** rejected because
  it sends a full snapshot per client even when nothing changed; SSE sends the
  same snapshot without the empty round trips.
- **`LISTEN/NOTIFY`:** rejected because it ties the stream to a dedicated
  connection per API instance and an event format the ticket writes would have
  to maintain; the probe needs no write-path change.
- **Materialized views with a pg-boss refresh:** rejected for phase 9 because
  every refresh adds staleness and a second failure mode for a dataset that
  fits the indexed live query.
- **A random token per wall display row:** rejected because it would add a table
  for one value; a single rotatable token in `settings` is enough for a trusted
  internal display.
- **A stateless TV token like the iCal token:** rejected because it cannot be
  revoked without rotating the session secret, which would sign out every user.
- **A chart library:** rejected because the requirement is a handful of series;
  inline SVG keeps the dependency list unchanged.
- **Deriving "test" from a source value:** rejected because a test ticket is not
  a source and a real `API` ticket can be a test too; an explicit flag is
  unambiguous.

## Consequences

- The dashboard stream is read-only and needs no write-path hook; a stalled
  probe delays an update by at most five seconds plus the query time.
- The wall display stops working immediately when the admin rotates the token;
  the page shows the new URL after the rotation, like the iCal page.
- Statistics and dashboard share the views but not the snapshot contract; a new
  metric is added to the view first.
- `tickets.is_test` must be set by the reference-data generator and by any
  future test-data path; a ticket inserted without the flag counts as real data.
- Rotating `SESSION_SECRET` still invalidates the personal iCal token of
  ADR-0011, while the TV token survives it.
