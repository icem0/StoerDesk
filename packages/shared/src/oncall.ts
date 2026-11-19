/**
 * DST-safe on-call settings and weekly slot calculation
 * (`specs/04-oncall.md` §4a.1, §4a.3.1; ADR-0011 decision 1).
 *
 * The module is pure: it resolves the on-call settings from an input record and
 * generates local wall-clock slots in `Europe/Berlin`, converting both ends to
 * UTC with `date-fns-tz`. A week that contains a DST transition is 167 or 169
 * hours long instead of a fixed 168; the web UI consumes the resulting UTC
 * instants and never performs timezone math itself.
 */

import { fromZonedTime, toZonedTime } from 'date-fns-tz'

/** Fixed on-call timezone (ADR-0011 decision 1). */
export const ONCALL_TIMEZONE = 'Europe/Berlin'

/** `0` = Sunday, `1` = Monday, …, `6` = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * One duty window of the window plan (`specs/04-oncall.md` §4a.3.2, ADR-0035):
 * the duty of one weekday with its start and its end as the wall clock of
 * `Europe/Berlin`. The end is later than the start on the same day.
 */
export type OncallWindow = {
  weekday: Weekday
  start: string // `HH:MM`
  end: string // `HH:MM`, later than `start`
}

/** Resolved on-call settings (`specs/04-oncall.md` §4a.1). */
export type OncallSettings = {
  weekStartWeekday: Weekday
  startTime: string // `HH:MM`, `Europe/Berlin` wall clock
  durationDays: number // 1–28
  swapRequiresAdminApproval: boolean
  escalateToGroupAfterMin: number // 1–1440 (minutes)
  reminderUnconfirmedH: number // 1–720 (hours)
  unfilledWarningDays: number // 1–365 (days)
  defaultPoolId: string | undefined // UUID of an active pool
  weeklyWindows: OncallWindow[] // the window plan (§4a.3.2), empty = continuous plan
}

export const ONCALL_SETTINGS_DEFAULTS: OncallSettings = {
  weekStartWeekday: 1,
  startTime: '07:00',
  durationDays: 7,
  swapRequiresAdminApproval: true,
  escalateToGroupAfterMin: 10,
  reminderUnconfirmedH: 24,
  unfilledWarningDays: 14,
  defaultPoolId: undefined,
  weeklyWindows: [],
}

const START_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Resolves the duty windows of the window plan (`specs/04-oncall.md` §4a.3.2).
 * A value that is no array falls back to the default (the continuous plan); a
 * malformed entry is dropped, a second window of the same weekday is ignored.
 * The result is sorted by the weekday.
 */
function resolveWeeklyWindows(value: unknown): OncallWindow[] {
  if (!Array.isArray(value)) {
    return ONCALL_SETTINGS_DEFAULTS.weeklyWindows
  }

  const windows: OncallWindow[] = []
  const seen = new Set<number>()

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }

    const { weekday, start, end } = entry as Record<string, unknown>

    if (!isInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) {
      continue
    }

    if (!isString(start) || !START_TIME_RE.test(start)) {
      continue
    }

    if (!isString(end) || !START_TIME_RE.test(end) || end <= start) {
      continue
    }

    seen.add(weekday)
    windows.push({ weekday: weekday as Weekday, start, end })
  }

  return windows.sort((left, right) => left.weekday - right.weekday)
}

/**
 * Resolves the on-call settings from an input record. An invalid or missing
 * value falls back to its default; the result always satisfies §4a.1.
 */
export function resolveOncallSettings(values: Record<string, unknown>): OncallSettings {
  const weekStartWeekday =
    isInteger(values.weekStartWeekday) &&
    values.weekStartWeekday >= 0 &&
    values.weekStartWeekday <= 6
    ? (values.weekStartWeekday as Weekday)
    : ONCALL_SETTINGS_DEFAULTS.weekStartWeekday

  const startTime =
    isString(values.startTime) && START_TIME_RE.test(values.startTime)
      ? values.startTime
      : ONCALL_SETTINGS_DEFAULTS.startTime

  const durationDays =
    isInteger(values.durationDays) &&
    values.durationDays >= 1 &&
    values.durationDays <= 28
      ? values.durationDays
      : ONCALL_SETTINGS_DEFAULTS.durationDays

  const swapRequiresAdminApproval = isBoolean(values.swapRequiresAdminApproval)
    ? values.swapRequiresAdminApproval
    : ONCALL_SETTINGS_DEFAULTS.swapRequiresAdminApproval

  const escalateToGroupAfterMin =
    isInteger(values.escalateToGroupAfterMin) &&
    values.escalateToGroupAfterMin >= 1 &&
    values.escalateToGroupAfterMin <= 1440
      ? values.escalateToGroupAfterMin
      : ONCALL_SETTINGS_DEFAULTS.escalateToGroupAfterMin

  const reminderUnconfirmedH =
    isInteger(values.reminderUnconfirmedH) &&
    values.reminderUnconfirmedH >= 1 &&
    values.reminderUnconfirmedH <= 720
      ? values.reminderUnconfirmedH
      : ONCALL_SETTINGS_DEFAULTS.reminderUnconfirmedH

  const unfilledWarningDays =
    isInteger(values.unfilledWarningDays) &&
    values.unfilledWarningDays >= 1 &&
    values.unfilledWarningDays <= 365
      ? values.unfilledWarningDays
      : ONCALL_SETTINGS_DEFAULTS.unfilledWarningDays

  const defaultPoolId =
    isString(values.defaultPoolId) && UUID_RE.test(values.defaultPoolId)
      ? values.defaultPoolId
      : ONCALL_SETTINGS_DEFAULTS.defaultPoolId

  const weeklyWindows = resolveWeeklyWindows(values.weeklyWindows)

  return {
    weekStartWeekday,
    startTime,
    durationDays,
    swapRequiresAdminApproval,
    escalateToGroupAfterMin,
    reminderUnconfirmedH,
    unfilledWarningDays,
    defaultPoolId,
    weeklyWindows,
  }
}

/** A generated on-call slot, both ends stored as UTC. */
export type OncallSlot = {
  startsAt: Date
  endsAt: Date
}

/**
 * Generates local wall-clock on-call slots for `[from, to)` in `Europe/Berlin`.
 *
 * The first slot starts on the first local `weekStartWeekday` at `startTime` on
 * or after `from`. One slot is emitted per `durationDays` while the start is
 * before `to`; `endsAt` is the same local wall-clock time `durationDays` later.
 * Both ends are converted from `Europe/Berlin` to UTC, so DST weeks are 167 or
 * 169 hours long (`specs/04-oncall.md` §4a.3.1).
 */
export function generateOncallSlots({
  from,
  to,
  weekStartWeekday,
  startTime,
  durationDays,
}: {
  from: Date
  to: Date
  weekStartWeekday: Weekday
  startTime: string // `HH:MM`
  durationDays: number // 1–28
}): OncallSlot[] {
  const [startHour, startMinute] = startTime.split(':').map((part) => Number(part))

  // `from` expressed as a zoned date: its UTC fields read as local wall-clock.
  const fromLocal = toZonedTime(from, ONCALL_TIMEZONE)

  // Candidate slot start: target weekday on/after `from`'s local date at
  // `startTime`, expressed as local wall-clock. `fromZonedTime` reads the
  // candidate's local fields, so the whole calculation stays independent of
  // the process time zone (`TZ`).
  const candidate = new Date(
    fromLocal.getFullYear(),
    fromLocal.getMonth(),
    fromLocal.getDate(),
    startHour,
    startMinute,
    0,
    0,
  )
  candidate.setDate(
    candidate.getDate() + ((weekStartWeekday - candidate.getDay() + 7) % 7),
  )

  let startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)

  // A candidate that falls before `from` moves to the next week.
  if (startsAt < from) {
    candidate.setDate(candidate.getDate() + 7)
    startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)
  }

  const slots: OncallSlot[] = []

  while (startsAt < to) {
    const endsLocal = new Date(candidate.getTime())
    endsLocal.setDate(endsLocal.getDate() + durationDays)
    const endsAt = fromZonedTime(endsLocal, ONCALL_TIMEZONE)

    slots.push({ startsAt, endsAt })

    candidate.setDate(candidate.getDate() + durationDays)
    startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)
  }

  return slots
}

/**
 * Generates the duty windows of the window plan for `[from, to)` in
 * `Europe/Berlin` (`specs/04-oncall.md` §4a.3.2, ADR-0035).
 *
 * One slot per window per week: the start is the `start` of the window on its
 * weekday, the end its `end` on the same day. Both ends are read as the local
 * wall clock and converted to UTC with `date-fns-tz`, so a window that contains
 * a DST change is one hour shorter or longer than its wall-clock length.
 *
 * Without a window the list is empty — the continuous plan of
 * `generateOncallSlots` is the plan then.
 */
export function generateOncallWindowSlots({
  from,
  to,
  weeklyWindows,
}: {
  from: Date
  to: Date
  weeklyWindows: OncallWindow[]
}): OncallSlot[] {
  const slots: OncallSlot[] = []

  if (weeklyWindows.length === 0) {
    return slots
  }

  const byWeekday = new Map<number, OncallWindow>()

  for (const window of weeklyWindows) {
    byWeekday.set(window.weekday, window)
  }

  // The local days of the range; the walk is over the local wall clock, so a
  // DST change never skips or repeats a day.
  const fromLocal = toZonedTime(from, ONCALL_TIMEZONE)
  const toLocal = toZonedTime(to, ONCALL_TIMEZONE)

  const day = new Date(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate())
  const lastDay = new Date(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate())

  while (day <= lastDay) {
    const window = byWeekday.get(day.getDay())

    if (window !== undefined) {
      const [startHour, startMinute] = window.start.split(':').map((part) => Number(part))
      const [endHour, endMinute] = window.end.split(':').map((part) => Number(part))

      const startLocal = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        startHour,
        startMinute,
        0,
        0,
      )
      const endLocal = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        endHour,
        endMinute,
        0,
        0,
      )

      const startsAt = fromZonedTime(startLocal, ONCALL_TIMEZONE)
      const endsAt = fromZonedTime(endLocal, ONCALL_TIMEZONE)

      if (startsAt < to && endsAt > from) {
        slots.push({ startsAt, endsAt })
      }
    }

    day.setDate(day.getDate() + 1)
  }

  return slots
}
