/**
 * Escalation helpers (`specs/07-escalation.md` §7.2, ADR-0017, WP-M13-11).
 *
 * The rules are configuration in the database (`escalation_rules`, WP-M13-03);
 * the former hard-coded rule list and its resolver are gone. This module keeps
 * the pure helper a scan needs to read an optional minute override and the
 * wall-clock helpers of the `time_of_day` condition leaf (`specs/07-escalation.md`
 * §7.4, WP-M14-41): an interval `HH:MM-HH:MM` matched against the `Europe/Berlin`
 * wall clock, start included, end excluded and wrapping over midnight — and the
 * threshold of the `timer_expired` leaves of a rule (ADR-0064, §7.7).
 */

import { toZonedTime } from 'date-fns-tz'

import type { EscalationCondition, EscalationTimerValue } from './schemas/escalation-config.js'

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

/**
 * The clock of the timers of one rule (ADR-0064, `specs/07-escalation.md` §7.7):
 * the facts `escalationTimerThreshold` turns into the threshold of the firing log.
 */
export type EscalationTimerClock = {
  /** The priority of the ticket; the delay of a minutes timer is read for it. */
  priority: string
  /** The instant (epoch milliseconds) of every start value that has happened. */
  startAt: Readonly<Record<string, number>>
  /** The timeline of a percent timer: `received_at` → `deadline_at` (epoch milliseconds). */
  timeline?: { from: number; to: number }
  /** The paused milliseconds between two instants; the clock stops while a pause runs. */
  pausedBetween?: (from: number, to: number) => number
}

/**
 * The threshold of a rule from the `expired` timer leaves of its condition
 * (ADR-0064, `specs/07-escalation.md` §7.7): the start value plus the delay of
 * the priority of the ticket plus the pauses inside — a percent timer the
 * share of the timeline plus the pauses inside. An `all` group answers the
 * largest threshold of its children (every timer must have expired), an `any`
 * group the smallest (one timer suffices), so the threshold of a rule stays
 * the same from scan to scan. `notExpired` leaves, timers whose start value
 * never happened and the other leaves contribute nothing; a condition without
 * such a timer answers `null` — the rule then waits from the start of its
 * stage (§7.11). The result is an instant in epoch milliseconds.
 */
export function escalationTimerThreshold(
  condition: EscalationCondition | null | undefined,
  clock: EscalationTimerClock,
): number | null {
  if (condition === null || condition === undefined) {
    return null
  }

  if ('all' in condition || 'any' in condition) {
    const children = 'all' in condition ? condition.all : condition.any
    const thresholds = children
      .map((child) => escalationTimerThreshold(child, clock))
      .filter((value): value is number => value !== null)

    if (thresholds.length === 0) {
      return null
    }

    return 'all' in condition ? Math.max(...thresholds) : Math.min(...thresholds)
  }

  if (condition.field !== 'timer_expired' || condition.operator !== 'expired') {
    return null
  }

  const value = condition.value as EscalationTimerValue
  const paused = clock.pausedBetween ?? (() => 0)

  if ('percent' in value) {
    if (clock.timeline === undefined) {
      return null
    }

    const { from, to } = clock.timeline
    const point = from + ((to - from) * value.percent) / 100

    return point + paused(from, point)
  }

  const start = clock.startAt[value.reference]

  if (start === undefined) {
    return null
  }

  const delay = (value.minutes as Record<string, number>)[clock.priority] ?? value.minutes.normal
  const point = start + delay * 60 * 1000

  return point + paused(start, point)
}
