# ADR-0011: On-call slot model, swap approval and calendar feed

- Status: accepted
- Date: 2026-11-06
- Stakeholders: admin, office, on-call technicians

## Context

`PLAN.md` §8 fixes the on-call defaults and the shift states, but leaves four
points open or implicit: the local-time slot calculation across DST, whether a
swap needs admin approval, how a pool defines its members, and how a calendar
app can subscribe to a technician's shifts without a session cookie. `PLAN.md`
§19 lists the swap approval as an open decision that needs an ADR before the
related WP starts.

The existing `groups` and `user_groups` tables already model memberships. The
product has no fifth on-call table in `PLAN.md` §6, and adding one only for pool
membership would duplicate the group model.

## Decision

1. **Local wall-clock weeks.** Slots start at the configured weekday and time in
   `Europe/Berlin` and end at the same local time `duration_days` later. Both
   ends are converted to UTC and stored as `timestamptz`, so DST weeks are 167
   or 169 hours long instead of a fixed 168. The pure generator lives in
   `packages/shared` and uses `date-fns-tz` (`PLAN.md` §4).
2. **Swaps require admin approval by default.** `oncall.swap_requires_admin_approval`
   defaults to `true`. The first acceptance is still atomic and wins, but the
   shift changes only after an admin approves. The original technician remains
   responsible until then. The setting `false` makes the acceptance effective
   immediately.
3. **Pool membership uses groups.** `oncall_pools.group_id` optionally links the
   existing `groups` row; its members are the pool. A pool without a group uses
   all active users with the `oncall` role. There is no `oncall_pool_members`
   table.
4. **Default pool by setting.** `oncall.default_pool_id` selects the pool for
   ticket coupling; without it the first active pool by lower-case name is used.
   The office may pass a different `poolId` on the offer route.
5. **Stateless iCal token.** The personal feed token is
   `<userId>.<base64url(HMAC-SHA256(userId, SESSION_SECRET))>`. It needs no table,
   is stable per user and is verified with a timing-safe comparison; a wrong
   token answers `404`.

## Alternatives

- **Fixed 168-hour blocks:** rejected because a DST transition would move the
  handover to 06:00 or 08:00 local time and break the operational handover.
- **No admin approval:** rejected as the default because a swap is a personnel
  decision; the setting keeps a self-organised deployment possible.
- **`oncall_pool_members` table:** rejected because `groups` already exists and
  the phase-8 scope names four on-call tables.
- **Signed JWT feed token:** rejected as unnecessary; an HMAC over the user id
  has no expiry state to manage and can be recomputed at any time.
- **Session-authenticated feed:** rejected because calendar applications cannot
  send the session cookie.

## Consequences

- The slot generator must carry DST tests for March and October; the phase-8
  exit criterion requires them.
- A pool's membership follows group changes automatically, and a group can be
  shared by several pools.
- Rotating `SESSION_SECRET` invalidates every iCal subscription; the page shows
  the new URL afterwards.
- Swap approval adds one admin step in the default deployment, and the atomic
  first acceptance is independent of the approval decision.
