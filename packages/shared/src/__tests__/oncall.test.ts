import { describe, expect, it } from 'vitest'

import {
  generateOncallSlots,
  generateOncallWindowSlots,
  ONCALL_SETTINGS_DEFAULTS,
  resolveOncallSettings,
  resolveOncallWindows,
  type OncallSettings,
  type OncallWindow,
} from '../oncall'

const HOUR = 60 * 60 * 1000

describe('resolveOncallSettings', () => {
  it('returns the defaults for an empty record', () => {
    expect(resolveOncallSettings({})).toEqual(ONCALL_SETTINGS_DEFAULTS)
  })

  it('passes valid values through', () => {
    const settings = resolveOncallSettings({
      weekStartWeekday: 3,
      startTime: '09:30',
      durationDays: 14,
      swapRequiresAdminApproval: false,
      escalateToGroupAfterMin: 60,
      reminderUnconfirmedH: 48,
      unfilledWarningDays: 30,
      defaultPoolId: '550e8400-e29b-41d4-a716-446655440000',
    })

    expect(settings).toMatchObject({
      weekStartWeekday: 3,
      startTime: '09:30',
      durationDays: 14,
      swapRequiresAdminApproval: false,
      escalateToGroupAfterMin: 60,
      reminderUnconfirmedH: 48,
      unfilledWarningDays: 30,
      defaultPoolId: '550e8400-e29b-41d4-a716-446655440000',
    } as Partial<OncallSettings>)
  })

  it.each([
    ['weekStartWeekday', -1],
    ['weekStartWeekday', 7],
    ['weekStartWeekday', '1'],
    ['weekStartWeekday', 1.5],
  ])('falls back to the default weekday for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.weekStartWeekday).toBe(ONCALL_SETTINGS_DEFAULTS.weekStartWeekday)
  })

  it.each([
    ['startTime', '25:00'],
    ['startTime', '7:00'],
    ['startTime', '07:60'],
    ['startTime', ''],
    ['startTime', 7],
  ])('falls back to the default start time for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.startTime).toBe(ONCALL_SETTINGS_DEFAULTS.startTime)
  })

  it.each([
    ['durationDays', 0],
    ['durationDays', 29],
    ['durationDays', '7'],
    ['durationDays', 7.5],
  ])('falls back to the default duration for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.durationDays).toBe(ONCALL_SETTINGS_DEFAULTS.durationDays)
  })

  it.each([
    ['swapRequiresAdminApproval', 'true'],
    ['swapRequiresAdminApproval', 1],
  ])('falls back to the default approval flag for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.swapRequiresAdminApproval).toBe(
      ONCALL_SETTINGS_DEFAULTS.swapRequiresAdminApproval,
    )
  })

  it.each([
    ['escalateToGroupAfterMin', 0],
    ['escalateToGroupAfterMin', 1441],
    ['escalateToGroupAfterMin', '10'],
  ])('falls back to the default escalation minutes for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.escalateToGroupAfterMin).toBe(ONCALL_SETTINGS_DEFAULTS.escalateToGroupAfterMin)
  })

  it.each([
    ['reminderUnconfirmedH', 0],
    ['reminderUnconfirmedH', 721],
  ])('falls back to the default reminder hours for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.reminderUnconfirmedH).toBe(ONCALL_SETTINGS_DEFAULTS.reminderUnconfirmedH)
  })

  it.each([
    ['unfilledWarningDays', 0],
    ['unfilledWarningDays', 366],
  ])('falls back to the default warning days for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.unfilledWarningDays).toBe(ONCALL_SETTINGS_DEFAULTS.unfilledWarningDays)
  })

  it.each([
    ['defaultPoolId', 'not-a-uuid'],
    ['defaultPoolId', 123],
  ])('falls back to undefined for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.defaultPoolId).toBeUndefined()
  })
})

describe('resolveOncallWindows', () => {
  it('resolves the duty windows and sorts them by the weekday', () => {
    expect(
      resolveOncallWindows([
        { weekday: 5, start: '07:00', end: '12:00' },
        { weekday: 1, start: '07:30', end: '17:00' },
      ]),
    ).toEqual([
      { weekday: 1, start: '07:30', end: '17:00' },
      { weekday: 5, start: '07:00', end: '12:00' },
    ])
  })

  it('falls back to the continuous plan when the windows are no array', () => {
    expect(resolveOncallWindows('07:30-17:00')).toEqual([])
  })

  it('drops a malformed window and keeps the valid ones', () => {
    expect(
      resolveOncallWindows([
        { weekday: 1, start: '07:30', end: '17:00' },
        { weekday: 7, start: '07:30', end: '17:00' },
        { weekday: 2, start: '7:30', end: '17:00' },
        { weekday: 3, start: '17:00', end: '07:30' },
        { weekday: 4, start: '07:30', end: '17:00', extra: true },
        'not-a-window',
      ]),
    ).toEqual([
      { weekday: 1, start: '07:30', end: '17:00' },
      { weekday: 4, start: '07:30', end: '17:00' },
    ])
  })

  it('keeps the first window of a weekday', () => {
    expect(
      resolveOncallWindows([
        { weekday: 1, start: '07:30', end: '17:00' },
        { weekday: 1, start: '09:00', end: '12:00' },
      ]),
    ).toEqual([{ weekday: 1, start: '07:30', end: '17:00' }])
  })
})

describe('generateOncallSlots', () => {
  const monday07 = { weekStartWeekday: 1 as const, startTime: '07:00', durationDays: 7 }

  it('emits one 168-hour slot for a normal November week', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T06:00:00.000Z'),
      ...monday07,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-09T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(7 * 24 * HOUR)
  })

  it('emits a 167-hour slot for the spring DST week of 2026-03-23', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-03-23T00:00:00.000Z'),
      to: new Date('2026-03-30T05:00:00.000Z'),
      ...monday07,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-03-23T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-03-30T05:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(167 * HOUR)
  })

  it('emits a 169-hour slot for the autumn DST week of 2026-10-19', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-10-19T00:00:00.000Z'),
      to: new Date('2026-10-26T06:00:00.000Z'),
      ...monday07,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-10-19T05:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-10-26T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(169 * HOUR)
  })

  it('starts on a non-Monday weekday', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-12T06:00:00.000Z'),
      weekStartWeekday: 4,
      startTime: '07:00',
      durationDays: 7,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-05T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-12T06:00:00.000Z').getTime())
  })

  it('honours a non-07:00 start time', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T08:30:00.000Z'),
      weekStartWeekday: 1,
      startTime: '09:30',
      durationDays: 7,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T08:30:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-09T08:30:00.000Z').getTime())
  })

  it('emits multiple slots for a duration other than 7 days', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-10T00:00:00.000Z'),
      weekStartWeekday: 1,
      startTime: '07:00',
      durationDays: 3,
    })

    expect(slots).toHaveLength(3)
    for (const slot of slots) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(3 * 24 * HOUR)
    }
  })

  it('emits no slot when the range ends before the first start', () => {
    const slots = generateOncallSlots({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T05:00:00.000Z'),
      ...monday07,
    })

    expect(slots).toHaveLength(0)
  })

  it('includes a slot whose start is exactly `from`', () => {
    const from = new Date('2026-11-02T06:00:00.000Z')
    const slots = generateOncallSlots({
      from,
      to: new Date('2026-11-09T06:00:00.000Z'),
      ...monday07,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(from.getTime())
  })
})

describe('generateOncallWindowSlots', () => {
  const officeWindows: OncallWindow[] = [
    { weekday: 1, start: '07:30', end: '17:00' },
    { weekday: 2, start: '07:30', end: '17:00' },
    { weekday: 3, start: '07:30', end: '17:00' },
    { weekday: 4, start: '07:30', end: '17:00' },
    { weekday: 5, start: '07:00', end: '12:00' },
  ]

  it('emits one slot per window of the week', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      weeklyWindows: officeWindows,
    })

    expect(slots).toHaveLength(5)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T06:30:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-02T16:00:00.000Z').getTime())
    expect(slots[3]!.endsAt.getTime()).toBe(new Date('2026-11-05T16:00:00.000Z').getTime())
    expect(slots[4]!.startsAt.getTime()).toBe(new Date('2026-11-06T06:00:00.000Z').getTime())
    expect(slots[4]!.endsAt.getTime()).toBe(new Date('2026-11-06T11:00:00.000Z').getTime())
  })

  it('emits no slot for a weekday without a window', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-11-06T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      weeklyWindows: officeWindows,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-06T06:00:00.000Z').getTime())
  })

  it('emits the windows of every week of the range', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-16T00:00:00.000Z'),
      weeklyWindows: officeWindows,
    })

    expect(slots).toHaveLength(10)
    expect(slots[5]!.startsAt.getTime()).toBe(new Date('2026-11-09T06:30:00.000Z').getTime())
  })

  it('emits nothing without a window - the continuous plan is the plan then', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      weeklyWindows: [],
    })

    expect(slots).toHaveLength(0)
  })

  it('emits a window over a DST change one hour shorter', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-03-29T00:00:00.000Z'),
      to: new Date('2026-03-30T00:00:00.000Z'),
      weeklyWindows: [{ weekday: 0, start: '00:30', end: '03:30' }],
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-03-28T23:30:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-03-29T01:30:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(2 * HOUR)
  })

  it('leaves a window out that lies outside the range', () => {
    const slots = generateOncallWindowSlots({
      from: new Date('2026-11-02T07:00:00.000Z'),
      to: new Date('2026-11-02T12:00:00.000Z'),
      weeklyWindows: officeWindows,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T06:30:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-02T16:00:00.000Z').getTime())
  })
})
