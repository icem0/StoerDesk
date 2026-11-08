import { describe, expect, it } from 'vitest'

import { escapeIcalText, icalTokenFor, serializeIcal, verifyIcalToken } from '../ical.js'

const secret = 'unit-test-secret'
const userId = '0193a5b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b'
const updatedAt = new Date('2026-11-05T09:00:00.000Z')

describe('iCal token', () => {
  it('round-trips the user id', () => {
    const token = icalTokenFor(userId, secret)

    expect(token.startsWith(`${userId}.`)).toBe(true)
    expect(verifyIcalToken(token, secret)).toBe(userId)
  })

  it('rejects a token signed with another secret', () => {
    const token = icalTokenFor(userId, 'other-secret')

    expect(verifyIcalToken(token, secret)).toBeNull()
  })

  it('rejects a tampered user id and a tampered signature', () => {
    const token = icalTokenFor(userId, secret)
    const otherId = '0193a5b2-7c4d-7e8f-9a0b-1c2d3e4f5a6c'
    const [id, signature] = token.split('.') as [string, string]

    expect(verifyIcalToken(`${otherId}.${signature}`, secret)).toBeNull()
    expect(verifyIcalToken(`${id}.${signature.slice(0, -1)}A`, secret)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyIcalToken('', secret)).toBeNull()
    expect(verifyIcalToken('not-a-uuid.signature', secret)).toBeNull()
    expect(verifyIcalToken(`${userId}`, secret)).toBeNull()
    expect(verifyIcalToken(`${userId}.`, secret)).toBeNull()
    expect(verifyIcalToken(`${userId}.a.b`, secret)).toBeNull()
  })
})

describe('iCal text escaping', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcalText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf')
  })
})

describe('serializeIcal', () => {
  const shift = {
    id: '0193a5b2-7c4d-7e8f-9a0b-1c2d3e4f5a70',
    startsAt: new Date('2026-11-02T07:00:00.000Z'),
    endsAt: new Date('2026-11-09T07:00:00.000Z'),
    poolName: 'Notdienst, Nord; 1',
    updatedAt,
  }

  it('writes UTC VEVENTs with a stable UID and localized text', () => {
    const calendar = serializeIcal([shift], 'de')

    expect(calendar).toContain('BEGIN:VCALENDAR\r\n')
    expect(calendar).toContain(`UID:${shift.id}@stoerdesk\r\n`)
    expect(calendar).toContain('DTSTAMP:20261105T090000Z\r\n')
    expect(calendar).toContain('DTSTART:20261102T070000Z\r\n')
    expect(calendar).toContain('DTEND:20261109T070000Z\r\n')
    expect(calendar).toContain('SUMMARY:Bereitschaft: ')
    expect(calendar).toContain('\\, Nord\\; 1')
    expect(calendar).toContain('DESCRIPTION:Bereitschaftsdienst im Pool ')
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('uses the English locale and writes an empty calendar', () => {
    expect(serializeIcal([shift], 'en')).toContain('SUMMARY:On-call: ')
    expect(serializeIcal([], 'en')).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//StoerDesk//On-call//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    )
  })

  it('folds long lines at 75 octets', () => {
    const calendar = serializeIcal([{ ...shift, poolName: 'Bereitschaftsgruppe '.repeat(8) }], 'de')

    for (const line of calendar.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
  })
})
