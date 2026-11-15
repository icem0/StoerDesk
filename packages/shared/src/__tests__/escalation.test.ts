import { describe, expect, it } from 'vitest'

import {
  TIME_OF_DAY_INTERVAL_PATTERN,
  minutesOfDay,
  positiveMinutes,
  timeOfDayIntervalMatches,
  wallClockMinutes,
} from '../escalation'
import {
  escalationConditionSchema,
  evaluateEscalationCondition,
  type EscalationFacts,
} from '../schemas/escalation-config.js'

describe('positiveMinutes', () => {
  it('accepts a positive minute value', () => {
    expect(positiveMinutes(15)).toBe(15)
    expect(positiveMinutes(1)).toBe(1)
  })

  it('rejects zero, negative and non-finite values', () => {
    expect(positiveMinutes(0)).toBeUndefined()
    expect(positiveMinutes(-4)).toBeUndefined()
    expect(positiveMinutes(Number.NaN)).toBeUndefined()
    expect(positiveMinutes(undefined)).toBeUndefined()
  })
})

describe('the time_of_day wall-clock helpers', () => {
  it('accept the shape of an interval', () => {
    expect(TIME_OF_DAY_INTERVAL_PATTERN.test('22:00-06:00')).toBe(true)
    expect(TIME_OF_DAY_INTERVAL_PATTERN.test('22:00-6:00')).toBe(false)
    expect(TIME_OF_DAY_INTERVAL_PATTERN.test('22:00–06:00')).toBe(false)
  })

  it('read a clock time and reject an impossible one', () => {
    expect(wallClockMinutes('00:00')).toBe(0)
    expect(wallClockMinutes('06:30')).toBe(390)
    expect(wallClockMinutes('23:59')).toBe(1439)
    expect(wallClockMinutes('24:00')).toBeNull()
    expect(wallClockMinutes('06:60')).toBeNull()
    expect(wallClockMinutes('6:00')).toBeNull()
  })

  it('resolve the Berlin wall clock across a DST change', () => {
    expect(minutesOfDay(new Date('2026-01-15T23:00:00Z'))).toBe(0)
    expect(minutesOfDay(new Date('2026-07-15T21:00:00Z'))).toBe(1380)
  })

  it('match an interval over midnight with an included start and an excluded end', () => {
    expect(timeOfDayIntervalMatches('22:00-06:00', 1380)).toBe(true)
    expect(timeOfDayIntervalMatches('22:00-06:00', 720)).toBe(false)
    expect(timeOfDayIntervalMatches('06:00-22:00', 720)).toBe(true)
    expect(timeOfDayIntervalMatches('06:00-22:00', 1320)).toBe(false)
    expect(timeOfDayIntervalMatches('22:00-06:00', 1320)).toBe(true)
    expect(timeOfDayIntervalMatches('22:00-00:00', 1439)).toBe(true)
    expect(timeOfDayIntervalMatches('22:00-00:00', 0)).toBe(false)
  })

  it('ignore an interval that names no clock time', () => {
    expect(timeOfDayIntervalMatches('25:00-99:00', 0)).toBe(false)
    expect(timeOfDayIntervalMatches('06:00', 360)).toBe(false)
  })
})

describe('the time_of_day condition leaf', () => {
  const baseFacts: EscalationFacts = {
    priority: 'high',
    status: 'IN_REVIEW',
    source: 'QR',
    systemType: 'BMA',
    objectExternalType: 'BMA 2000',
    assigned: false,
    deadlinePercent: 42,
    elapsedMinutes: 17,
    paused: false,
    stageReached: ['review'],
  }

  it('keeps a saved rule silent during the day', async () => {
    escalationConditionSchema.parse({ field: 'time_of_day', operator: 'in', value: ['22:00-06:00'] })

    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'in', value: ['22:00-06:00'] },
        { ...baseFacts, timeOfDay: '12:00' },
      ),
    ).toBe(false)
  })

  it('fires the same rule in the night', async () => {
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'in', value: ['22:00-06:00'] },
        { ...baseFacts, timeOfDay: '23:30' },
      ),
    ).toBe(true)
  })

  it('inverts the rule with notIn', async () => {
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'notIn', value: ['06:00-22:00'] },
        { ...baseFacts, timeOfDay: '23:00' },
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'notIn', value: ['06:00-22:00'] },
        { ...baseFacts, timeOfDay: '12:00' },
      ),
    ).toBe(false)
  })

  it('takes the whole day from several intervals', async () => {
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'in', value: ['00:00-06:00', '22:00-00:00'] },
        { ...baseFacts, timeOfDay: '23:00' },
      ),
    ).toBe(true)
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'in', value: ['00:00-06:00', '22:00-00:00'] },
        { ...baseFacts, timeOfDay: '12:00' },
      ),
    ).toBe(false)
  })

  it('never matches an impossible interval', async () => {
    expect(
      evaluateEscalationCondition(
        { field: 'time_of_day', operator: 'in', value: ['25:00-99:00'] },
        { ...baseFacts, timeOfDay: '12:00' },
      ),
    ).toBe(false)
  })

  it('rejects a leaf with a malformed interval or a wrong operator', async () => {
    for (const condition of [
      { field: 'time_of_day', operator: 'in', value: ['22:00'] },
      { field: 'time_of_day', operator: 'in', value: ['6:00-22:00'] },
      { field: 'time_of_day', operator: 'eq', value: '22:00-06:00' },
    ]) {
      expect(escalationConditionSchema.safeParse(condition).success).toBe(false)
    }
  })
})
