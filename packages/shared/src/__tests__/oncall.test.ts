import { describe, expect, it } from 'vitest'

import {
  generateOncallBlockSlots,
  generateOncallSlots,
  generateOncallWindowSlots,
  isCoveredByPattern,
  mergeOncallBlocks,
  ONCALL_SETTINGS_DEFAULTS,
  resolveOncallBlocks,
  resolveOncallSettings,
  resolveOncallWindows,
  type OncallBlock,
  type OncallBlockPattern,
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
    ['reminderRepeatH', 0],
    ['reminderRepeatH', 73],
  ])('falls back to the default reminder interval for %s = %j', (key, value) => {
    const settings = resolveOncallSettings({ [key]: value } as Record<string, unknown>)
    expect(settings.reminderRepeatH).toBe(ONCALL_SETTINGS_DEFAULTS.reminderRepeatH)
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

describe('resolveOncallBlocks', () => {
  it('reads a stored day window as a block of one day', () => {
    expect(resolveOncallBlocks([{ weekday: 3, start: '07:00', end: '12:00' }])).toEqual([
      { fromWeekday: 3, toWeekday: 3, start: '07:00', end: '12:00' },
    ])
  })

  it('reads a stored block with its weekdays', () => {
    expect(
      resolveOncallBlocks([
        { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
        { from_weekday: 5, to_weekday: 5, start: '07:00', end: '12:00' },
      ]),
    ).toEqual([
      { fromWeekday: 1, toWeekday: 4, start: '07:00', end: '17:00' },
      { fromWeekday: 5, toWeekday: 5, start: '07:00', end: '12:00' },
    ])
  })

  it('sorts the blocks by the first day of the week of Monday to Sunday', () => {
    expect(
      resolveOncallBlocks([
        { from_weekday: 0, to_weekday: 0, start: '07:00', end: '12:00' },
        { from_weekday: 1, to_weekday: 1, start: '07:00', end: '12:00' },
        { from_weekday: 6, to_weekday: 6, start: '07:00', end: '12:00' },
      ]).map((block) => block.fromWeekday),
    ).toEqual([1, 6, 0])
  })

  it('drops a block whose last weekday lies before its first weekday', () => {
    expect(
      resolveOncallBlocks([
        { from_weekday: 5, to_weekday: 2, start: '07:00', end: '17:00' },
        { from_weekday: 1, to_weekday: 1, start: '07:00', end: '17:00' },
      ]),
    ).toEqual([{ fromWeekday: 1, toWeekday: 1, start: '07:00', end: '17:00' }])
  })

  it('drops a malformed block and keeps the valid ones', () => {
    expect(
      resolveOncallBlocks([
        { from_weekday: 1, to_weekday: 4, start: '7:00', end: '17:00' },
        { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
        { from_weekday: 7, to_weekday: 7, start: '07:00', end: '17:00' },
        { from_weekday: 1, to_weekday: 4, start: '17:00', end: '07:00' },
        'not-a-block',
      ]),
    ).toEqual([{ fromWeekday: 1, toWeekday: 4, start: '07:00', end: '17:00' }])
  })

  it('falls back to the continuous plan when the blocks are no array', () => {
    expect(resolveOncallBlocks('07:00-17:00')).toEqual([])
  })
})

describe('mergeOncallBlocks', () => {
  it('merges the day windows of Monday to Thursday into one block', () => {
    const blocks = resolveOncallBlocks([
      { weekday: 1, start: '07:30', end: '17:00' },
      { weekday: 2, start: '07:30', end: '17:00' },
      { weekday: 3, start: '07:30', end: '17:00' },
      { weekday: 4, start: '07:30', end: '17:00' },
      { weekday: 5, start: '07:00', end: '12:00' },
    ])

    expect(mergeOncallBlocks(blocks)).toEqual([
      { fromWeekday: 1, toWeekday: 4, start: '07:30', end: '17:00' },
      { fromWeekday: 5, toWeekday: 5, start: '07:00', end: '12:00' },
    ])
  })

  it('merges seven days around the clock into one block', () => {
    const blocks = resolveOncallBlocks([
      { weekday: 0, start: '00:00', end: '23:59' },
      { weekday: 1, start: '00:00', end: '23:59' },
      { weekday: 2, start: '00:00', end: '23:59' },
      { weekday: 3, start: '00:00', end: '23:59' },
      { weekday: 4, start: '00:00', end: '23:59' },
      { weekday: 5, start: '00:00', end: '23:59' },
      { weekday: 6, start: '00:00', end: '23:59' },
    ])

    expect(mergeOncallBlocks(blocks)).toEqual([
      { fromWeekday: 1, toWeekday: 0, start: '00:00', end: '23:59' },
    ])
  })

  it('keeps two blocks with different daily windows apart', () => {
    const blocks = resolveOncallBlocks([
      { from_weekday: 1, to_weekday: 4, start: '07:00', end: '17:00' },
      { from_weekday: 5, to_weekday: 5, start: '07:00', end: '12:00' },
    ])

    expect(mergeOncallBlocks(blocks)).toEqual(blocks)
  })

  it('keeps a block apart that a covered weekday separates', () => {
    const blocks = resolveOncallBlocks([
      { weekday: 1, start: '08:00', end: '16:00' },
      { weekday: 2, start: '10:00', end: '12:00' },
      { weekday: 3, start: '08:00', end: '16:00' },
    ])

    expect(mergeOncallBlocks(blocks)).toEqual(blocks)
  })

  it('keeps a contradictory plan as it is', () => {
    const blocks = resolveOncallBlocks([
      { from_weekday: 1, to_weekday: 2, start: '08:00', end: '16:00' },
      { weekday: 2, start: '10:00', end: '12:00' },
    ])

    expect(mergeOncallBlocks(blocks)).toEqual(blocks)
  })

  it('returns an empty plan unchanged', () => {
    expect(mergeOncallBlocks([])).toEqual([])
  })
})

describe('generateOncallBlockSlots', () => {
  const officeBlocks: OncallBlock[] = [
    { fromWeekday: 1, toWeekday: 4, start: '07:00', end: '17:00' },
    { fromWeekday: 5, toWeekday: 5, start: '07:00', end: '12:00' },
  ]

  it('emits one slot per block of the week with its pattern', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      blocks: officeBlocks,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-02T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-05T16:00:00.000Z').getTime())
    expect(slots[0]!.pattern).toEqual({
      weekdays: [1, 2, 3, 4],
      dailyStart: '07:00',
      dailyEnd: '17:00',
    })
    expect(slots[1]!.startsAt.getTime()).toBe(new Date('2026-11-06T06:00:00.000Z').getTime())
    expect(slots[1]!.endsAt.getTime()).toBe(new Date('2026-11-06T11:00:00.000Z').getTime())
    expect(slots[1]!.pattern).toEqual({
      weekdays: [5],
      dailyStart: '07:00',
      dailyEnd: '12:00',
    })
  })

  it('emits the blocks of every week of the range', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-16T00:00:00.000Z'),
      blocks: officeBlocks,
    })

    expect(slots).toHaveLength(4)
    expect(slots[2]!.startsAt.getTime()).toBe(new Date('2026-11-09T06:00:00.000Z').getTime())
  })

  it('emits one slot for a block around the clock', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-01T23:00:00.000Z'),
      to: new Date('2026-11-08T23:00:00.000Z'),
      blocks: [{ fromWeekday: 1, toWeekday: 0, start: '00:00', end: '24:00' }],
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-01T23:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-08T23:00:00.000Z').getTime())
    expect(slots[0]!.pattern.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('emits a block around the clock over a DST change one hour shorter', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-03-22T23:00:00.000Z'),
      to: new Date('2026-03-29T22:00:00.000Z'),
      blocks: [{ fromWeekday: 1, toWeekday: 0, start: '00:00', end: '24:00' }],
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-03-22T23:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-03-29T22:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(167 * HOUR)
  })

  it('emits a block of one day like a day window', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-04T00:00:00.000Z'),
      to: new Date('2026-11-05T00:00:00.000Z'),
      blocks: [{ fromWeekday: 3, toWeekday: 3, start: '07:00', end: '12:00' }],
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]!.startsAt.getTime()).toBe(new Date('2026-11-04T06:00:00.000Z').getTime())
    expect(slots[0]!.endsAt.getTime()).toBe(new Date('2026-11-04T11:00:00.000Z').getTime())
    expect(slots[0]!.pattern.weekdays).toEqual([3])
  })

  it('leaves a block out that lies outside the range', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-07T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      blocks: officeBlocks,
    })

    expect(slots).toHaveLength(0)
  })

  it('emits nothing without a block - the continuous plan is the plan then', () => {
    const slots = generateOncallBlockSlots({
      from: new Date('2026-11-02T00:00:00.000Z'),
      to: new Date('2026-11-09T00:00:00.000Z'),
      blocks: [],
    })

    expect(slots).toHaveLength(0)
  })
})

describe('isCoveredByPattern', () => {
  const pattern: OncallBlockPattern = {
    weekdays: [1, 2, 3, 4],
    dailyStart: '07:00',
    dailyEnd: '17:00',
  }

  const shift = {
    startsAt: new Date('2026-11-02T06:00:00.000Z'),
    endsAt: new Date('2026-11-05T16:00:00.000Z'),
    pattern,
  }

  it('covers a time of a covered weekday inside the daily window', () => {
    expect(isCoveredByPattern(shift, new Date('2026-11-02T07:00:00.000Z'))).toBe(true)
  })

  it('does not cover a time outside the daily window', () => {
    expect(isCoveredByPattern(shift, new Date('2026-11-02T05:00:00.000Z'))).toBe(false)
    expect(isCoveredByPattern(shift, new Date('2026-11-02T16:00:00.000Z'))).toBe(false)
  })

  it('does not cover a time of a weekday outside the pattern', () => {
    expect(isCoveredByPattern(shift, new Date('2026-11-06T08:00:00.000Z'))).toBe(false)
  })

  it('does not cover a time outside the span', () => {
    expect(isCoveredByPattern(shift, new Date('2026-11-01T08:00:00.000Z'))).toBe(false)
  })

  it('covers the whole span of a shift without a pattern', () => {
    expect(
      isCoveredByPattern(
        { startsAt: new Date('2026-11-02T06:00:00.000Z'), endsAt: new Date('2026-11-03T06:00:00.000Z') },
        new Date('2026-11-02T23:00:00.000Z'),
      ),
    ).toBe(true)
  })
})
