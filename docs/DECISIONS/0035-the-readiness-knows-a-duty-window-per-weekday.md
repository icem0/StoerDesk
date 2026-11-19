# ADR-0035: The readiness knows a duty window per weekday

- Status: accepted
- Date: 2026-11-19
- Stakeholders: admin, office, on-call technicians

## Context

The office reported that the plan of the pool „Verwaltung" cannot be expressed:
the shift runs on Monday from 07:30 to 17:00 and on Friday from 07:00 to 12:00.
The on-call settings know a week start, a start time and a duration in days
(`specs/04-oncall.md` §4a.1), so a shift is a block that never ends: from the
week start at `start_time` for `duration_days` days. The plan has no end of a
duty at all, and the end of a shift is always `duration_days` after its start
(§4a.3.1).

The settings are the only place that describes the plan of the readiness. A
change of the model touches the generator, the planner and the form, and it
touches every deployment: a 24/7 duty around the clock must keep working.

## Decision

1. **Two shapes of the plan.** The *continuous plan* is the one of ADR-0011
   (`week_start_weekday`, `start_time`, `duration_days`). The *window plan* is a
   duty window per weekday and lives in the setting `oncall.weekly_windows`. A
   stored window makes the window plan the plan; without a window the
   continuous plan stands. The values of the continuous plan stay stored and
   take effect again when the windows are removed.
2. **A window is one weekday of the week.** It carries the weekday (`0` =
   Sunday, the numbering of `week_start_weekday`), a start and an end in the
   `Europe/Berlin` wall clock. The end is later than the start on the same day;
   at most one window per weekday. A weekday without a window is a free day.
3. **Every window is a shift of its own.** The generator emits one shift per
   window per week (`generateOncallWindowSlots`). The state machine, the
   confirmation, the swap, the personal iCal feed and the coupling of a ticket
   work on a shift and need no change: outside the windows there is no shift,
   so there is no on-call person and the offer goes to the group (§4a.6).
4. **The window plan is a plan, not a filter.** The windows do not narrow the
   shifts of the continuous plan; they create new shifts next to them. The
   existing shifts keep their times until the admin deletes them (§4a.3).
5. **The windows are instance-wide.** The plan lives in the settings, like the
   eight keys of §4a.1, and not in a table of its own: it needs no relation,
   no foreign key and no migration.

## Alternatives

- **One more setting `oncall.end_time`:** rejected. It gives every weekday of
  the rotation the same window, so the Friday of the „Verwaltung", which ends
  at 12:00, still cannot be expressed.
- **The windows as a second layer over the continuous shift:** rejected. The
  shift in the calendar would stay the whole week although the duty is live
  for a few hours only, and the coupling of a ticket would need a second
  condition ("inside a window") next to "a shift covers now".
- **A window that ends before it starts (a night duty):** not in this version.
  The model would need a second day for the end; the continuous plan covers a
  duty around the clock.
- **A table of windows per pool:** rejected. The plan is an instance-wide
  setting like the eight keys of §4a.1, and a table would add a migration, a
  foreign key and a second administration for no gain.
- **Two windows per weekday (a break at noon):** rejected for this version.
  The list of the setting allows it later; the form and the validation keep it
  out for now.

## Consequences

- The plan of a pool with office hours becomes expressible; the office enters
  the windows of the „Verwaltung" instead of a duration in days.
- With a window plan the settings `week_start_weekday`, `start_time` and
  `duration_days` have no effect. The administration says so and keeps the
  values, so removing the windows brings the continuous plan back.
- The number of shifts per week grows from one to the number of the windows —
  five for the „Verwaltung". The confirmation, the swap and the iCal feed work
  per shift, so a technician confirms five shifts instead of one.
- The generator gets a second pure function; the DST tests of ADR-0011 stay
  valid for the continuous plan, and the window plan needs its own test for a
  window that contains a DST change.
- A window plan and the shifts of the continuous plan can exist side by side.
  The admin deletes the future shifts of the old plan; a shift is never
  deleted after it started (§4a.3).
