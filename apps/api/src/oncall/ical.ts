import { createHmac, timingSafeEqual } from 'node:crypto'

import { t } from '@stoerdesk/shared'
import { toZonedTime } from 'date-fns-tz'
import { z } from 'zod'

/** One shift as the feed needs it: UTC range plus the pool name for the text. */
export type IcalShift = {
  id: string
  startsAt: Date
  endsAt: Date
  poolName: string
  /** Stable `DTSTAMP`; falls back to the start so the output stays deterministic. */
  updatedAt?: Date
  /**
   * The pattern of a duty block (`specs/04-oncall.md` §4a.3.3, ADR-0040): the
   * covered weekdays with the daily window. A shift with a pattern becomes one
   * recurring entry; a shift without one keeps its plain entry.
   */
  pattern?: { weekdays: number[]; dailyStart: string; dailyEnd: string } | null
}

const tokenPattern = /^[A-Za-z0-9_-]+$/

// SEC-005/SEC-011: a rolling 1-year bucket feeds the HMAC. A token from the previous
// bucket still validates (one grace window, max ~2 years); older tokens fail, so an
// abandoned feed URL has a natural expiry without a per-token DB row and without
// rotating `SESSION_SECRET`. Rotation still revokes everything at once (ADR-0011).
const IcalTokenBucketMs = 365 * 24 * 60 * 60 * 1000

function bucketFor(now: number): number {
  return Math.floor(now / IcalTokenBucketMs)
}

function signatureFor(userId: string, secret: string, bucket: number): Buffer {
  return createHmac('sha256', secret).update(`${userId}.${bucket}`).digest()
}

/** `<userId>.<base64url(HMAC-SHA256(userId + "." + bucket, SESSION_SECRET))>` (ADR-0011). */
export function icalTokenFor(userId: string, secret: string, now = Date.now()): string {
  return `${userId}.${signatureFor(userId, secret, bucketFor(now)).toString('base64url')}`
}

/** Returns the user id for a valid token and `null` for any malformed or forged one. */
export function verifyIcalToken(token: string, secret: string, now = Date.now()): string | null {
  const separator = token.indexOf('.')

  if (separator <= 0 || separator !== token.lastIndexOf('.')) {
    return null
  }

  const userId = token.slice(0, separator)
  const encoded = token.slice(separator + 1)

  if (!z.uuid().safeParse(userId).success || !tokenPattern.test(encoded)) {
    return null
  }

  const provided = Buffer.from(encoded, 'base64url')
  const currentBucket = bucketFor(now)

  for (const bucket of [currentBucket, currentBucket - 1]) {
    const expected = signatureFor(userId, secret, bucket)

    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return userId
    }
  }

  return null
}

function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks. */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
function foldLine(line: string): string {
  const chunks: string[] = []
  let current = ''
  let bytes = 0

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    const limit = chunks.length === 0 ? 75 : 74

    if (bytes + charBytes > limit && current.length > 0) {
      chunks.push(chunks.length === 0 ? current : ` ${current}`)
      current = ''
      bytes = 0
    }

    current += char
    bytes += charBytes
  }

  chunks.push(chunks.length === 0 ? current : ` ${current}`)

  return chunks.join('\r\n')
}

/** The weekday codes of an `RRULE` (`0` = Sunday). */
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** The zone of the duty times (`specs/04-oncall.md` §4a.1). */
const ICAL_TIMEZONE = 'Europe/Berlin'

/**
 * The zone of the duty times for the clients that need it (RFC 5545): the
 * rules of the European Union — the last Sunday of March to the last Sunday
 * of October.
 */
const VTIMEZONE_LINES = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICAL_TIMEZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** The local wall clock of `Europe/Berlin` as the date and the time of RFC 5545. */
function formatLocal(date: Date): string {
  const local = toZonedTime(date, ICAL_TIMEZONE)

  return `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}T${pad(
    local.getHours(),
  )}${pad(local.getMinutes())}00`
}

/**
 * The end of the daily window in the local wall clock: the start of the
 * occurrence plus the length of the daily window. The arithmetic runs on the
 * wall clock, so a change of the offset does not move the end of the day.
 */
function formatLocalEnd(startsAt: Date, minutes: number): string {
  const local = toZonedTime(startsAt, ICAL_TIMEZONE)
  const total = local.getHours() * 60 + local.getMinutes() + minutes
  const days = Math.floor(total / (24 * 60))
  const rest = total % (24 * 60)
  const end = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + days,
    Math.floor(rest / 60),
    rest % 60,
    0,
    0,
  )

  return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(
    end.getHours(),
  )}${pad(end.getMinutes())}00`
}

function minutesOf(time: string): number {
  if (time === '24:00') {
    return 24 * 60
  }

  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function eventLines(shift: IcalShift, locale: string): string[] {
  const pool = shift.poolName
  const summary = t(locale, 'oncall.ical.summary', { pool })
  const description = t(locale, 'oncall.ical.description', { pool })
  const stamp = shift.updatedAt ?? shift.startsAt
  const pattern = shift.pattern

  if (pattern !== undefined && pattern !== null && pattern.weekdays.length > 0) {
    // A duty block is one recurring entry: the daily window with the weekdays
    // of the block (`specs/04-oncall.md` §4a.3.3, ADR-0040 decision 5).
    const days = pattern.weekdays
      .map((day) => WEEKDAY_CODES[day])
      .filter((code) => code !== undefined)
      .join(',')
    const length = minutesOf(pattern.dailyEnd) - minutesOf(pattern.dailyStart)

    return [
      'BEGIN:VEVENT',
      `UID:${shift.id}@stoerdesk`,
      `DTSTAMP:${formatUtc(stamp)}`,
      `DTSTART;TZID=${ICAL_TIMEZONE}:${formatLocal(shift.startsAt)}`,
      `DTEND;TZID=${ICAL_TIMEZONE}:${formatLocalEnd(shift.startsAt, length)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days}`,
      `SUMMARY:${escapeIcalText(summary)}`,
      `DESCRIPTION:${escapeIcalText(description)}`,
      'END:VEVENT',
    ]
  }

  return [
    'BEGIN:VEVENT',
    `UID:${shift.id}@stoerdesk`,
    `DTSTAMP:${formatUtc(stamp)}`,
    `DTSTART:${formatUtc(shift.startsAt)}`,
    `DTEND:${formatUtc(shift.endsAt)}`,
    `SUMMARY:${escapeIcalText(summary)}`,
    `DESCRIPTION:${escapeIcalText(description)}`,
    'END:VEVENT',
  ]
}

/** Serializes the shifts of one user as a read-only RFC 5545 calendar. */
export function serializeIcal(shifts: IcalShift[], locale: string): string {
  const recurring = shifts.some(
    (shift) => shift.pattern !== undefined && shift.pattern !== null && shift.pattern.weekdays.length > 0,
  )
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StoerDesk//On-call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(recurring ? VTIMEZONE_LINES : []),
    ...shifts.flatMap((shift) => eventLines(shift, locale)),
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
