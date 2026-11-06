# 04 — On-call

**Chapter:** 5a
**Scope:** ~280 lines
**Status:** reviewed for phase 8 (WP-M8-01)

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
| `oncall.default_pool_id` | — | UUID of an active pool |

`readOncallSettings(database)` returns the resolved values once per request and
is the only reader; it never writes. The administration page writes the keys
through `PUT /api/v1/settings/oncall` (`settings.write`), validated against the
table above.

## 4a.2 Pools

A pool is one on-call calendar (for example "fire alarm" or "nurse call").

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID v7 | primary key |
| `name` | text, not null | trimmed, 1–100 characters, unique case-insensitively |
| `group_id` | UUID, nullable | foreign key to `groups`, `ON DELETE SET NULL` |
| `active` | boolean, not null, default `true` | inactive pools keep their shifts but offer no new slots |
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
| `DRAFT` | technician assigned, not published | no |
| `PLANNED` | published, technician has not confirmed | yes, with a warning |
| `CONFIRMED` | technician confirmed | yes |
| `DECLINED` | technician declined, admin must reassign | no |
| `SWAP_REQUESTED` | confirmed shift with an open swap | yes, original technician |

Transitions (admin actions carry `oncall.admin`, technician actions
`oncall.confirm` / `oncall.swap`):

```
UNFILLED / DRAFT / PLANNED / DECLINED --admin assign--> DRAFT | PLANNED
DRAFT --admin publish--> PLANNED
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

## 4a.4 Confirmation and decline

`POST /api/v1/oncall/shifts/:id/confirm` and
`POST /api/v1/oncall/shifts/:id/decline`:

- only the assigned technician or an admin may act; anyone else gets `403
  forbidden`,
- only a `PLANNED` shift can be confirmed, only a `PLANNED` or `CONFIRMED`
  shift can be declined, and never after `starts_at` (`409 oncall_shift_started`),
- a decline requires a reason of 5–500 characters (`422
  oncall_decline_reason_required`); the ticket decline rule of `PLAN.md` §7
  applies unchanged,
- both accept an optional `clientUuid`. The `oncall_events.client_uuid` unique
  column makes a replay idempotent: the second request answers `200` with the
  current shift and does not write a second event,
- both write one append-only `oncall_events` row: `confirmed` or `declined` with
  `{ reason? }`.

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
comparison and answers `404 ical_not_found` on any mismatch. The token is shown
on the "my on-call" page so the user can subscribe in a calendar app.

## 4a.8 API summary

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET/POST /api/v1/oncall/pools` | `oncall.read` / `oncall.admin` | list and create pools |
| `PATCH/DELETE /api/v1/oncall/pools/:id` | `oncall.admin` | rename, deactivate, delete |
| `GET /api/v1/oncall/shifts?from=&to=&poolId=` | `oncall.read` | calendar range |
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
| `GET /api/v1/oncall/warnings` | `oncall.read` | unstaffed and unconfirmed slots |
| `GET /api/v1/oncall/ical/:token.ics` | — | personal calendar feed |

`oncall_events` is append-only and protected against `UPDATE`/`DELETE` by the
trigger of `PLAN.md` §15, like `ticket_events`.

## 4a.9 Boundaries

- No notification delivery in this phase: the coupling sets the target and the
  event payload; the outbox worker of phase 7 stays untouched.
- The dashboard tile and statistics of `PLAN.md` §13 are phase 9; they read the
  coupling function and the shift table.
- Claiming from the pool and accepting a swap remain online-only.
- Offline support covers confirm and decline only, through the existing outbox
  mechanism.
- The iCal feed is read-only; it never writes shifts.
