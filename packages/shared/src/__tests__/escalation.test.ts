import { describe, expect, it } from 'vitest'

import {
  TIME_OF_DAY_INTERVAL_PATTERN,
  escalationTimerThreshold,
  minutesOfDay,
  positiveMinutes,
  timeOfDayIntervalMatches,
  wallClockMinutes,
} from '../escalation'
import {
  escalationConditionSchema,
  evaluateEscalationCondition,
  type EscalationCondition,
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
    escalationConditionSchema.parse({
      field: 'time_of_day',
      operator: 'in',
      value: ['22:00-06:00'],
    })

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

describe('escalationTimerThreshold (ADR-0064, §7.7)', () => {
  const minute = 60 * 1000
  const received = Date.parse('2026-11-27T08:00:00Z')
  const minutes = { low: 30, normal: 15, high: 10, critical: 5 }
  const timer = (
    reference: string,
    operator: 'expired' | 'notExpired' = 'expired',
  ): EscalationCondition =>
    ({
      field: 'timer_expired',
      operator,
      value: { reference, minutes },
    }) as EscalationCondition
  const percent = (value: number): EscalationCondition =>
    ({
      field: 'timer_expired',
      operator: 'expired',
      value: { percent: value },
    }) as EscalationCondition
  const clock = {
    priority: 'normal',
    startAt: { received_at: received, offered: received + 20 * minute },
    timeline: { from: received, to: received + 100 * minute },
  }

  it('answers the start value plus the delay of the priority', () => {
    expect(escalationTimerThreshold(timer('received_at'), clock)).toBe(received + 15 * minute)
    expect(escalationTimerThreshold(timer('received_at'), { ...clock, priority: 'critical' })).toBe(
      received + 5 * minute,
    )
    expect(escalationTimerThreshold(timer('received_at'), { ...clock, priority: 'unknown' })).toBe(
      received + 15 * minute,
    )
  })

  it('adds the pauses inside the delay', () => {
    const pausedBetween = (from: number, to: number) =>
      Math.max(0, Math.min(to, received + 12 * minute) - Math.max(from, received + 10 * minute))

    expect(escalationTimerThreshold(timer('received_at'), { ...clock, pausedBetween })).toBe(
      received + 17 * minute,
    )
  })

  it('answers the share of the timeline for a percent timer', () => {
    expect(escalationTimerThreshold(percent(80), clock)).toBe(received + 80 * minute)
    expect(escalationTimerThreshold(percent(100), clock)).toBe(received + 100 * minute)
    expect(escalationTimerThreshold(percent(80), { ...clock, timeline: undefined })).toBeNull()
  })

  it('takes the largest timer of an all group and the smallest of an any group', () => {
    const both = [timer('received_at'), timer('offered')]

    expect(escalationTimerThreshold({ all: both }, clock)).toBe(received + 35 * minute)
    expect(escalationTimerThreshold({ any: both }, clock)).toBe(received + 15 * minute)
    expect(
      escalationTimerThreshold(
        { all: [{ field: 'priority', operator: 'eq', value: 'high' }, { any: both }] },
        clock,
      ),
    ).toBe(received + 15 * minute)
  })

  it('answers null without an expired timer whose start value happened', () => {
    expect(escalationTimerThreshold(null, clock)).toBeNull()
    expect(escalationTimerThreshold({ all: [] }, clock)).toBeNull()
    expect(escalationTimerThreshold(timer('accepted'), clock)).toBeNull()
    expect(escalationTimerThreshold(timer('received_at', 'notExpired'), clock)).toBeNull()
    expect(
      escalationTimerThreshold({ field: 'paused', operator: 'eq', value: false }, clock),
    ).toBeNull()
  })

  it('agrees with the evaluation of the leaf', () => {
    const facts: EscalationFacts = {
      priority: 'high',
      status: 'NEW',
      source: 'QR',
      systemType: null,
      objectExternalType: null,
      assigned: false,
      deadlinePercent: 0,
      elapsedMinutes: 10,
      paused: false,
      stageReached: [],
      sinceEvent: { received_at: 10 },
    }

    expect(evaluateEscalationCondition(timer('received_at'), facts)).toBe(true)
    expect(
      evaluateEscalationCondition(timer('received_at'), {
        ...facts,
        sinceEvent: { received_at: 9 },
      }),
    ).toBe(false)
    expect(escalationTimerThreshold(timer('received_at'), { ...clock, priority: 'high' })).toBe(
      received + 10 * minute,
    )
  })
})
