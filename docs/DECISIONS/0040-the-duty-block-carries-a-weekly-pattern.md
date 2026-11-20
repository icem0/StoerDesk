# ADR-0040: The duty block carries a weekly pattern

- Status: accepted
- Date: 2026-11-20
- Stakeholders: admin, office, on-call technicians
- Amends: ADR-0035 (decisions 2 and 3)

## Context

ADR-0035 binds a duty window to one weekday and makes every window one shift.
The office „Verwaltung" runs Monday to Thursday 07:00–17:00 and Friday
07:00–12:00. With ADR-0035 this becomes five shifts a week, one per day
("Tagesschichten"). The office wants one shift for Monday to Thursday and one
for Friday. The technician duty „Montag bis Sonntag" is a single shift for the
whole week, which the window plan cannot express either.

## Decision

1. **A duty block spans consecutive weekdays.** A block has `from_weekday`,
   `to_weekday` (`0` = Sunday, the numbering of ADR-0035, `from` ≤ `to` within
   the week Monday to Sunday), a daily `start` and `end` in `Europe/Berlin`
   with `end` later than `start`. A one-day window of ADR-0035 is a block with
   `from_weekday` = `to_weekday`.
2. **One block is one shift per week.** The generator emits one shift per block
   per week. Its span runs from the first day at `start` to the last day at
   `end`, and the shift carries the pattern (`weekdays`, `daily_start`,
   `daily_end`). Between the days of the span the duty is the daily window
   only: outside `daily_start`–`daily_end` nobody is on duty, even inside the
   span.
3. **Blocks replace the day windows of a pool.** A pool carries its blocks in
   `oncall_pools.weekly_windows`, the same column as ADR-0035; a stored value
   without `from_weekday` is read as a one-day block. The pool still falls back
   to the continuous plan without blocks.
4. **Confirmation, swap, history and the technician stay per shift.** A block
   has one technician for its whole span. Single days cannot be swapped in this
   version; a swap moves the whole block. This keeps the state machine of
   §4a.4 and §4a.5 unchanged.
5. **Coupling and iCal read the pattern.** A time counts as covered only when
   it lies in the span, its local weekday is in the pattern and its local time
   lies in the daily window. The personal iCal feed emits one recurring entry
   (`RRULE` with `BYDAY`) per block instead of one entry per day.
6. **A duty around the clock is a block from `00:00` to `24:00`.** The
   continuous plan of ADR-0011 remains valid and needs no migration.

## Alternatives

- **Keep day shifts and merge them in the view:** rejected. The coupling, the
  confirmation and the swap would still work per day, and a technician would
  confirm five shifts for one duty.
- **A span without a daily pattern (Monday 07:00 to Thursday 17:00 as one
  shift):** rejected. It counts the nights as on-call time.
- **Keep the day windows next to blocks:** rejected. Two models for the same
  duty make the coupling and the form harder to keep correct.

## Consequences

- Shifts of the day windows already created stay as they are (§4a.9). New
  generation uses blocks only after WP-M20-03.
- A migration adds the pattern columns with defaults that describe a one-day
  block, so existing rows stay valid.
- ADR-0035 keeps the continuous plan, the coupling rule for the group and the
  rule that a shift is the unit of confirmation and swap.
