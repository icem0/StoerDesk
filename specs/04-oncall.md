# 04 — On-call

**Chapter:** 5a
**Scope:** ~280 lines
**Status:** reviewed for phase 8 (WP-M8-01), amended for the readiness rules of
WP-M14-26 (ADR-0021) and for the duty windows of WP-M15-01 (ADR-0035)

The binding summary is `PLAN.md` §8. This slice details the settings, pools,
weekly slots, the shift state machine, confirm/decline, swaps, ticket coupling
and the personal iCal feed. The decisions that `PLAN.md` left open are
ADR-0011.

## 4a.1 Settings

All on-call settings live as scalar jsonb values in the existing `settings`
table. A missing or invalid row falls back to the default; no migration is
needed for them.

| Key | Default | Validation |
| --- | --- | --- |
| `oncall.week_start_weekday` | `1` (Monday) | integer `0`–`6`, `0` = Sunday |
| `oncall.start_time` | `"07:00"` | `^([01]\d\|2[0-3]):[0-5]\d$` |
| `oncall.duration_days` | `7` | integer `1`–`28` |
| `oncall.swap_requires_admin_approval` | `true` | boolean |
| `oncall.escalate_to_group_after_min` | `10` | positive integer, max. 1440 |
| `oncall.reminder_unconfirmed_h` | `24` | positive integer, max. 720 |
| `oncall.unfilled_warning_days` | `14` | positive integer, max. 365 |
| `oncall.default_pool_id` | — | UUID of an active pool for ticket offers and the dashboard tile |

`readOncallSettings(database)` returns the resolved values once per request and
is the only reader; it never writes. The administration page writes the keys
through `PUT /api/v1/settings/oncall` (`settings.write`), validated against the
table above.

The plan of a readiness pool has two shapes (§4a.3.2): the **continuous plan**
of ADR-0011 — the global week start, start time and duration in days — and the
**window plan**, a duty window per weekday stored on the pool (§4a.2). A stored
pool window makes the window plan the plan for that pool; without a window the
pool uses the continuous plan. The two plans belong to different scopes: the
continuous plan is global, the windows are per pool, so „Verwaltung" and
„Servicetechniker" can keep different duty times at the same time.

## 4a.2 Pools

A pool is one on-call calendar (for example "fire alarm" or "nurse call").

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `name` | text, not null | trimmed, 1–100 characters, unique case-insensitively |
| `group_id` | UUID, nullable | foreign key to `groups`, `ON DELETE SET NULL` |
| `active` | boolean, not null, default `true` | inactive pools keep their shifts but offer no new slots |
| `weekly_windows` | jsonb, not null, default `[]` | the duty windows of this pool — §4a.3.2 |
| `created_at`, `updated_at` | timestamptz | as `specs/02-data-model.md` §4.2 |

The optional `group_id` defines the pool membership: "ask the whole pool" means
the current members of that group. A pool without a group uses every active
user holding the `oncall` role. This avoids a fifth on-call table.

Pools are maintained with `oncall.admin`; reading needs `oncall.read`. A pool may
be deactivated but not deleted while it has shifts (`409 oncall_pool_in_use`).

## 4a.3 Shifts and weekly slots

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `pool_id` | UUID, not null | foreign key to `oncall_pools`, `ON DELETE CASCADE` |
| `user_id` | UUID, nullable | responsible technician, foreign key to `users`, `ON DELETE SET NULL` |
| `state` | text, not null, default `UNFILLED` | check over the six states below |
| `starts_at`, `ends_at` | timestamptz, not null | stored in UTC; `ends_at > starts_at` |
| `confirmed_at`, `declined_at` | timestamptz, nullable | set by the matching action |
| `created_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `created_at`, `updated_at` | timestamptz | as §4.2 |

Indexes: `oncall_shifts(pool_id, starts_at, ends_at)` as `PLAN.md` §6 requires,
plus a unique index on `(pool_id, starts_at)` so regenerating a range is
idempotent. A shift is never deleted after it started.

States:

| State | Meaning | Counts for ticket coupling |
| --- | --- | --- |
| `UNFILLED` | slot without a technician | no |
| `DRAFT` | technician assigned, not published, still acceptable (ADR-0021) | no |
| `PLANNED` | published, technician has not confirmed | yes, with a warning |
| `CONFIRMED` | technician confirmed | yes |
| `DECLINED` | technician declined, admin must reassign | no |
| `SWAP_REQUESTED` | confirmed shift with an open swap | yes, original technician |

Transitions (admin actions carry `oncall.admin`, technician actions
`oncall.confirm` / `oncall.swap`):

```
UNFILLED / DRAFT / PLANNED / DECLINED --admin assign--> DRAFT | PLANNED
DRAFT --admin publish--> PLANNED
DRAFT --technician confirm--> CONFIRMED (ADR-0021: the acceptance publishes)
PLANNED --technician confirm--> CONFIRMED
PLANNED / CONFIRMED --technician decline (reason)--> DECLINED
CONFIRMED --technician swap request--> SWAP_REQUESTED
SWAP_REQUESTED --swap accepted/approved--> CONFIRMED (new technician)
SWAP_REQUESTED --swap rejected/withdrawn--> CONFIRMED (original technician)
```

An admin may reassign any shift before it starts and only an admin may reassign
a shift after it started (`PLAN.md` §8). A reassign of a `SWAP_REQUESTED` shift
cancels the open swap and writes `swap_cancelled`. A shift that is `CONFIRMED`
or `SWAP_REQUESTED` cannot be deleted (`409 oncall_shift_locked`).

The weekly plan — generating the slots of a week, assigning or reassigning a
technician, publishing a draft and deleting a slot that did not start — belongs
to the readiness view, not to the administration: the admin works on the plan
where the calendar already shows who is on duty. The view shows the plan only
with `oncall.plan` or `oncall.admin`; every action of the plan is guarded by
the server as before (`oncall.plan` for the generation, `oncall.admin` for the
assignment, the publication and the deletion). A role without those keys reads
the same calendar without the plan.

The calendar range `GET /api/v1/oncall/shifts` answers the **technician** next to
the shift (ADR-0032, WP-M14-151): the row of a shift carries `technician` with
the display data of `user_id` (`{ id, givenName, familyName, email }`, the shape
of a pool member) or `null` while the slot has no technician. The technician of
a shift need not be a member of its pool — §4a.2 makes the pool the candidates of
a swap, not the owners of a shift — so the readiness calendar reads the name from
the shift and never resolves it over the members of a pool. The answer stays
guarded by `oncall.read` like the members route of a pool; the gate to the names
is in the web app (`oncall.read_names`, WP-M14-131/132).

### 4a.3.1 Slot calculation

Slots are local wall-clock weeks, not fixed 168-hour blocks. For a requested
range the generator emits one start per `oncall.duration_days` beginning at the
configured `week_start_weekday` and `start_time` in `Europe/Berlin`; `ends_at`
is the same local time `duration_days` later. Both ends are converted to UTC
with `date-fns-tz`, so a week that contains a DST transition is 167 or 169
hours long instead of 168.

Examples (Europe/Berlin, Monday 07:00):

| Local week | UTC interval | Length |
| --- | --- | --- |
| 2026-03-23 07:00 → 2026-03-30 07:00 | 06:00Z → 05:00Z | 167 h |
| 2026-10-19 07:00 → 2026-10-26 07:00 | 05:00Z → 06:00Z | 169 h |

`generateOncallSlots({ from, to, weekStartWeekday, startTime, durationDays })`
is a pure shared function; it returns `{ startsAt, endsAt }` pairs and is the
only place the local-time rule lives. The planning service uses it and
`INSERT … ON CONFLICT (pool_id, starts_at) DO NOTHING`, so a repeated
generation never moves or overwrites an existing slot.

### 4a.3.2 Duty windows

> Amended by §4a.3.3 (ADR-0040): a window is a block that may span consecutive
> weekdays, and one block is one shift per week. The text below describes the
> one-day form, which is the block with `from` = `to`.

The continuous plan of §4a.3.1 describes a duty that never ends: one shift
covers `duration_days` days. A pool with office hours — the „Verwaltung" of the
office, on Monday from 07:30 to 17:00 and on Friday from 07:00 to 12:00 —
cannot be expressed that way, because the plan knows no end of a duty. The
window plan describes the duty of every weekday on its own and belongs to one
pool (`oncall_pools.weekly_windows`, §4a.2): every pool carries its own windows,
so two pools can keep different duty times.

A window is

| Field | Type | Rule |
| --- | --- | --- |
| `weekday` | integer | `0`–`6`, `0` = Sunday (the numbering of `week_start_weekday`) |
| `start` | text | `^([01]\d|2[0-3]):[0-5]\d$`, wall clock of `Europe/Berlin` |
| `end` | text | the same pattern, later than `start` on the same day |

At most one window per weekday; a weekday without a window is a free day. A
window that ends before it starts (a night duty) is not part of this version —
the continuous plan covers a duty around the clock.

The generator `generateOncallWindowSlots({ from, to, weeklyWindows })` is a
pure shared function beside `generateOncallSlots`. For a requested range it
emits one slot per window per week: the start is the `start` of the window on
that weekday, the end its `end` on the same day, both converted to UTC with
`date-fns-tz`. A window that contains a DST change is one hour shorter or
longer than its wall-clock length.

Example (Europe/Berlin, the windows of Monday to Thursday 07:30–17:00 and of
Friday 07:00–12:00):

| Window | Local | UTC (winter) | Length |
| --- | --- | --- | --- |
| Monday | 2026-11-02 07:30 → 17:00 | 06:30Z → 16:00Z | 9.5 h |
| Friday | 2026-11-06 07:00 → 12:00 | 06:00Z → 11:00Z | 5 h |

Every window is a shift of its own: it has a state, a technician, a
confirmation, a swap and an entry in the personal iCal feed (§4a.3, §4a.4,
§4a.5, §4a.7). Outside the windows there is no shift and therefore no on-call
person: the offer of a ticket goes to the group (§4a.6).

The window plan does not change the shifts that exist. A shift of the
continuous plan keeps its times until the admin deletes it (§4a.3); the
windows create new shifts next to it. The administration edits the windows per
pool with `PATCH /api/v1/oncall/pools/:id`; a pool without windows uses the
global continuous plan.

### 4a.3.3 Duty blocks (ADR-0040)

A duty block replaces the one-day window of §4a.3.2 as the unit of the window
plan. It is the target model; it takes effect with WP-M20-03.

| Field | Type | Rule |
| --- | --- | --- |
| `from_weekday` | integer | `0`–`6`, `0` = Sunday |
| `to_weekday` | integer | `0`–`6`, not earlier than `from_weekday` within Monday to Sunday |
| `start` | text | `HH:MM`, wall clock of `Europe/Berlin` |
| `end` | text | `HH:MM`, later than `start` |

A block that spans days is one shift per week. Its span runs from the first day
at `start` to the last day at `end`; the shift stores the pattern `weekdays`
(the covered weekdays), `daily_start` and `daily_end`. Inside the span the duty
is the daily window only: a time on a covered weekday between `daily_start` and
`daily_end` is covered, every other time of the span is not.

Example (office): Monday to Thursday 07:00–17:00 is one block, Friday 07:00–12:00
is a second block. Each block is one shift per week, so the week holds two
shifts, not five. The duty around the clock is the block Monday to Sunday,
00:00–24:00.

Coupling (§4a.6) and the personal iCal feed (§4a.7) read the pattern: the iCal
feed names one recurring entry per block (`RRULE` with `BYDAY`).

Confirmation, decline, swap and history (§4a.4, §4a.5, §4a.10) act on the whole
block; one technician holds the block. Single days cannot be swapped in this
version.

### 4a.3.4 The plan is normalised (ADR-0044)

The plan of a pool is normalised: blocks that share the same daily window and
lie on consecutive weekdays of the week of Monday to Sunday become one block.
The weekdays between two such blocks must not be covered by another block; a
block that is separated from its neighbour by a covered weekday stays as it is.

The normalisation never changes the duty — the covered weekdays and the daily
window stay the same, only the number of blocks changes. A plan that covers a
weekday twice with different daily windows is contradictory; the normalisation
returns it unchanged and the administration resolves it.

The normalisation happens where the plan is read and written: the answer of
`GET /api/v1/oncall/pools` and the plan of the generator use the normalised
blocks, and a plan that is written with `PATCH /api/v1/oncall/pools/:id` is
stored normalised. A pool whose plan was written in the older form of §4a.3.2
(one entry per weekday) therefore shows its plan as blocks and creates one
shift per block per week — without a migration.

The shifts of the older plan stay as they are (§4a.9); the admin deletes them
and generates the blocks.

## 4a.4 Confirmation and decline

`POST /api/v1/oncall/shifts/:id/confirm` and
`POST /api/v1/oncall/shifts/:id/decline`:

- only the assigned technician or an admin may act; anyone else gets `403
  forbidden`,
- only a `DRAFT` or `PLANNED` shift can be confirmed, only a `PLANNED` or
  `CONFIRMED` shift can be declined, and never after `starts_at` (`409
  oncall_shift_started`) — the acceptance of a `DRAFT` readiness publishes it
  (ADR-0021),
- a decline requires a reason of 5–500 characters (`422
  oncall_decline_reason_required`); the ticket decline rule of `PLAN.md` §7
  applies unchanged,
- both accept an optional `clientUuid`. The `oncall_events.client_uuid` unique
  column makes a replay idempotent: the second request answers `200` with the
  current shift and does not write a second event,
- both write one append-only `oncall_events` row: `confirmed` or `declined` with
  `{ reason? }`.

The allocation announces itself (ADR-0021, WP-M14-29): `POST /api/v1/oncall/shifts`
with a `userId` and `PATCH /api/v1/oncall/shifts/:id` with a `userId` enqueue
`oncall.assigned` for that technician, `POST /api/v1/oncall/shifts/:id/swap`
enqueues `oncall.swap_requested` for the requester and for a named target. The
rows are written in the same transaction as the shift write, through the outbox
rules of `specs/10-notifications.md` §11.7 — never in a channel call. The
channel selection of the technician (`notification_preferences`, §11.4) decides
which channels they are notified through; without a selection the instance chain
of §11.1 applies.

Confirm and decline are the only offline writes of phase 8 (`PLAN.md` §9). The
web outbox stores them under a new Dexie table row kind; claiming from the pool
and accepting a swap stay online-only.

## 4a.5 Swap requests

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `shift_id` | UUID, not null | foreign key to `oncall_shifts`, `ON DELETE CASCADE` |
| `requested_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `target_user_id` | UUID, nullable | one colleague; `NULL` asks the whole pool |
| `status` | text, not null, default `PENDING` | check over `PENDING`, `ACCEPTED`, `APPROVED`, `DECLINED`, `CANCELLED`, `EXPIRED` |
| `accepted_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `accepted_at`, `approved_at` | timestamptz, nullable | |
| `approved_by_user_id` | UUID, nullable | foreign key to `users`, `ON DELETE SET NULL` |
| `created_at`, `updated_at` | timestamptz | as §4.2 |

A partial unique index allows at most one `PENDING` request per shift. Only the
confirmed technician of a shift that has not started may request a swap; the
original technician remains responsible until the swap is approved.

- `POST /api/v1/oncall/shifts/:id/swap` (`oncall.swap`) creates the request and
  moves the shift to `SWAP_REQUESTED`.
- `POST /api/v1/oncall/swaps/:id/accept` (`oncall.swap`) is atomic:
  `UPDATE oncall_swap_requests SET status='ACCEPTED', accepted_by_user_id=… WHERE
  id=… AND status='PENDING' RETURNING …`; the loser gets `409 swap_taken`. The
  request is limited to a colleague (`target_user_id`) or to pool members.
- With `oncall.swap_requires_admin_approval = true` the acceptance only records
  the candidate; `POST /api/v1/oncall/swaps/:id/approve` (`oncall.admin`) moves
  the shift to the accepting technician and the request to `APPROVED`. With the
  setting `false` the acceptance is immediately effective.
- `POST /api/v1/oncall/swaps/:id/reject` (`oncall.admin`) and
  `POST /api/v1/oncall/swaps/:id/cancel` (requester or admin) close the request
  as `DECLINED`/`CANCELLED` and return the shift to `CONFIRMED` with the
  original technician.
- A pending request cannot be accepted after `starts_at` (`409
  oncall_shift_started`); the admin then reassigns directly.

Every step writes one `oncall_events` row: `swap_requested`, `swap_accepted`,
`swap_approved`, `swap_rejected`, `swap_cancelled`.

## 4a.6 Ticket coupling

`resolveOnCallPerson(database, { at, poolId? })` resolves the default pool
(`oncall.default_pool_id`, otherwise the first active pool by lower-case name)
and returns one of:

- `{ kind: 'confirmed', userId, shiftId, poolId, endsAt }` — a `CONFIRMED` shift
  covers `at`,
- `{ kind: 'planned', userId, shiftId, poolId, endsAt }` — only a `PLANNED`
  shift covers `at`; the admin gets a warning,
- `{ kind: 'unstaffed', poolId }` — no confirmed or planned shift covers `at`.

`DRAFT`, `UNFILLED` and `DECLINED` never count, and a `SWAP_REQUESTED` shift
still counts with its original technician.

The existing `POST /api/v1/tickets/:ticketNo/offer` route accepts an optional
`poolId` and applies the result:

- `confirmed`/`planned`: set `tickets.offered_to_user_id` to that technician and
  `offer_escalated_at = now + oncall.escalate_to_group_after_min`;
- `unstaffed`: clear `offered_to_user_id` and append the `offered` event with
  `payload.onCall = 'unstaffed'` and `payload.warning = 'oncall_unstaffed'`;
  the response carries the same warning so the office sees it immediately;
- both set `payload.onCall`, `payload.shiftId` and `payload.poolId` on the
  `offered` event.

When the offer timeout passes while the ticket is still `OFFERED`, the minute
escalation scan clears `offered_to_user_id` and writes one `offer_escalated`
event (`PLAN.md` §8: "after the timeout or a decline they go to the group"). A
decline already returns the ticket to `WORK_ORDER_CREATED`.

`GET /api/v1/oncall/warnings` (`oncall.read`) answers the unstaffed shifts
inside `oncall.unfilled_warning_days` and the `PLANNED` shifts that start within
`oncall.reminder_unconfirmed_h`, plus the resolved default pool. The phase-9
dashboard tile reads `resolveOnCallPerson`; it is not part of phase 8.

## 4a.7 Personal iCal feed

`GET /api/v1/oncall/ical/:token.ics` is public (no session) and answers the
`PLANNED` and `CONFIRMED` shifts of one user from 30 days ago to 180 days ahead
as an RFC 5545 calendar with UTC `DTSTART`/`DTEND`. `SUMMARY` and `DESCRIPTION`
come from the server locale of the user.

The token is `<userId>.<base64url(HMAC-SHA256(userId, SESSION_SECRET))>`, stable
per user and never stored. The route verifies the signature with a timing-safe
comparison and answers `404 ical_not_found` on any mismatch. The URL is offered
on the "my on-call" page by the share button of the readiness calendar: the
button copies the URL into the clipboard, so the user can subscribe in a
calendar app.

## 4a.8 API summary

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET/POST /api/v1/oncall/pools` | `oncall.read` / `oncall.admin` | list and create pools |
| `PATCH/DELETE /api/v1/oncall/pools/:id` | `oncall.admin` | rename, deactivate, delete, edit the pool duty windows |
| `GET /api/v1/oncall/shifts?from=&to=&poolId=` | `oncall.read` | calendar range with the technician |
| `POST /api/v1/oncall/shifts` | `oncall.plan` | create one shift |
| `POST /api/v1/oncall/shifts/generate` | `oncall.plan` | idempotent weekly generation |
| `PATCH /api/v1/oncall/shifts/:id` | `oncall.admin` | assign, publish, reassign |
| `DELETE /api/v1/oncall/shifts/:id` | `oncall.admin` | delete a not-started slot |
| `POST /api/v1/oncall/shifts/:id/confirm` | `oncall.confirm` | technician confirms |
| `POST /api/v1/oncall/shifts/:id/decline` | `oncall.confirm` | technician declines with reason |
| `POST /api/v1/oncall/shifts/:id/swap` | `oncall.swap` | request a swap |
| `POST /api/v1/oncall/swaps/:id/accept` | `oncall.swap` | atomic first acceptance |
| `POST /api/v1/oncall/swaps/:id/(approve\|reject)` | `oncall.admin` | approval decision |
| `POST /api/v1/oncall/swaps/:id/cancel` | `oncall.swap` / `oncall.admin` | withdraw |
| `GET /api/v1/oncall/shifts/:id/history` | `oncall.read` | the append-only history of one shift |
| `GET /api/v1/oncall/warnings` | `oncall.read` | unstaffed and unconfirmed slots |
| `GET /api/v1/oncall/ical/:token.ics` | — | personal calendar feed |

`oncall_events` is append-only and protected against `UPDATE`/`DELETE` by the
trigger of `PLAN.md` §15, like `ticket_events`.

## 4a.9 Boundaries

- No notification delivery in phase 8: the allocation of a readiness, a swap
  request and the reminder of an unconfirmed shift notify the technician in
  phase 14 through the outbox rules of `specs/10-notifications.md` §11.4 and
  §11.7 (ADR-0021, WP-M14-27 … WP-M14-32); the coupling of a ticket keeps
  setting target and payload only.
- The dashboard tile and statistics of `PLAN.md` §13 are phase 9; they read the
  coupling function and the shift table.
- Claiming from the pool and accepting a swap remain online-only.
- Offline support covers confirm and decline only, through the existing outbox
  mechanism.
- The iCal feed is read-only; it never writes shifts.
- The window plan creates new shifts next to the shifts of the continuous
  plan; it never changes a shift that exists. The admin deletes the future
  shifts of the old plan — a shift is never deleted after it started (§4a.3).
- The duty blocks of §4a.3.3 replace the day windows of a pool in the plan,
  but they never touch the shifts that exist: the shifts of the day windows of
  ADR-0035 keep their times and cover their whole span, until the admin
  deletes them. A shift without a pattern — of the continuous plan or of an
  older version — keeps covering its whole span; only the shifts of a block
  carry a pattern.

## 4a.10 Shift history

Every shift carries its append-only history (`oncall_events`, §4a.4, §4a.5) in
the shift view and in the readiness calendar: `GET /api/v1/oncall/shifts/:id/history`
(`oncall.read`) answers the events of one shift oldest first with the type, the
timestamp, the acting person, the person an assignment or a swap refers to, the
state transition of an assignment and the decline reason. A raw event payload
never leaves the route. The history names no technician to a role without
`oncall.read_names`: the API answers the people like the shift list of §4a.3 and
the web app gates the names (`WP-M14-131/132`). A click on a shift of the
readiness calendar or on an own shift opens the dialog with the state, the pool,
the period, the technician and that history.
