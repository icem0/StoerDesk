import { createHmac, timingSafeEqual } from 'node:crypto'

import { t } from '@stoerdesk/shared'
import { z } from 'zod'

/** One shift as the feed needs it: UTC range plus the pool name for the text. */
export type IcalShift = {
  id: string
  startsAt: Date
  endsAt: Date
  poolName: string
  /** Stable `DTSTAMP`; falls back to the start so the output stays deterministic. */
  updatedAt?: Date
}

const tokenPattern = /^[A-Za-z0-9_-]+$/

function signatureFor(userId: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(userId).digest()
}

/** `<userId>.<base64url(HMAC-SHA256(userId, SESSION_SECRET))>` (ADR-0011). */
export function icalTokenFor(userId: string, secret: string): string {
  return `${userId}.${signatureFor(userId, secret).toString('base64url')}`
}

/** Returns the user id for a valid token and `null` for any malformed or forged one. */
export function verifyIcalToken(token: string, secret: string): string | null {
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
  const expected = signatureFor(userId, secret)

  if (provided.length !== expected.length) {
    return null
  }

  return timingSafeEqual(provided, expected) ? userId : null
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

function eventLines(shift: IcalShift, locale: string): string[] {
  const pool = shift.poolName
  const summary = t(locale, 'oncall.ical.summary', { pool })
  const description = t(locale, 'oncall.ical.description', { pool })
  const stamp = shift.updatedAt ?? shift.startsAt

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
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StoerDesk//On-call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...shifts.flatMap((shift) => eventLines(shift, locale)),
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
