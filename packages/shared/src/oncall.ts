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

  return {
    weekStartWeekday,
    startTime,
    durationDays,
    swapRequiresAdminApproval,
    escalateToGroupAfterMin,
    reminderUnconfirmedH,
    unfilledWarningDays,
    defaultPoolId,
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
  // `startTime`, expressed as local wall-clock.
  const candidate = new Date(
    Date.UTC(
      fromLocal.getUTCFullYear(),
      fromLocal.getUTCMonth(),
      fromLocal.getUTCDate(),
      startHour,
      startMinute,
      0,
      0,
    ),
  )
  candidate.setUTCDate(
    candidate.getUTCDate() +
      ((weekStartWeekday - candidate.getUTCDay() + 7) % 7),
  )

  let startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)

  // A candidate that falls before `from` moves to the next week.
  if (startsAt < from) {
    candidate.setUTCDate(candidate.getUTCDate() + 7)
    startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)
  }

  const slots: OncallSlot[] = []

  while (startsAt < to) {
    const endsLocal = new Date(candidate.getTime())
    endsLocal.setUTCDate(endsLocal.getUTCDate() + durationDays)
    const endsAt = fromZonedTime(endsLocal, ONCALL_TIMEZONE)

    slots.push({ startsAt, endsAt })

    candidate.setUTCDate(candidate.getUTCDate() + durationDays)
    startsAt = fromZonedTime(candidate, ONCALL_TIMEZONE)
  }

  return slots
}
