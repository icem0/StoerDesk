/**
 * Escalation helpers (`specs/07-escalation.md` §7.2, ADR-0017, WP-M13-11).
 *
 * The rules are configuration in the database (`escalation_rules`, WP-M13-03);
 * the former hard-coded rule list and its resolver are gone. This module keeps
 * the pure helper a scan needs to read an optional minute override and the
 * wall-clock helpers of the `time_of_day` condition leaf (`specs/07-escalation.md`
 * §7.4, WP-M14-41): an interval `HH:MM-HH:MM` matched against the `Europe/Berlin`
 * wall clock, start included, end excluded and wrapping over midnight.
 */

import { toZonedTime } from 'date-fns-tz'

/**
 * The wall-clock interval of a `time_of_day` condition leaf (`specs/07-escalation.md`
 * §7.4, WP-M14-41): `HH:MM-HH:MM`; the clock times themselves are checked by the
 * matching below, so a malformed interval never matches.
 */
export const TIME_OF_DAY_INTERVAL_PATTERN = /^\d{2}:\d{2}-\d{2}:\d{2}$/

/** The timezone a `time_of_day` leaf is matched against (`PLAN.md` §Time: display in `Europe/Berlin`). */
export const TIME_OF_DAY_ZONE = 'Europe/Berlin'

/** Minutes since midnight of a `HH:MM` wall-clock time; `null` when it is no clock time. */
export function wallClockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (match === null) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours > 23 || minutes > 59) {
    return null
  }

  return hours * 60 + minutes
}

/** Minutes since midnight of the `Europe/Berlin` wall clock for an instant (DST-safe). */
export function minutesOfDay(instant: Date): number {
  const local = toZonedTime(instant, TIME_OF_DAY_ZONE)

  return local.getHours() * 60 + local.getMinutes()
}

/** Does `minutes` lie in the interval `HH:MM-HH:MM` — start included, end excluded, wrapping over midnight? */
export function timeOfDayIntervalMatches(interval: string, minutes: number): boolean {
  const separator = interval.indexOf('-')

  if (separator === -1) {
    return false
  }

  const start = wallClockMinutes(interval.slice(0, separator))
  const end = wallClockMinutes(interval.slice(separator + 1))

  if (start === null || end === null) {
    return false
  }

  if (start === end) {
    return true
  }

  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

/** A usable minute value: finite and positive, everything else is `undefined`. */
export function positiveMinutes(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}
