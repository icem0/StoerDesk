import { describe, expect, it } from 'vitest'

import { computeTicketTimeline, DEADLINE_HOURS, deadlineAtFor } from '../timeline'

const HOUR = 60 * 60 * 1000

describe('deadlineAtFor', () => {
  const base = new Date('2026-11-05T08:00:00.000Z')

  it.each([
    ['low', DEADLINE_HOURS.low],
    ['normal', DEADLINE_HOURS.normal],
    ['high', DEADLINE_HOURS.high],
    ['critical', DEADLINE_HOURS.critical],
  ])('uses the ADR-0008 default for %s', (priority, hours) => {
    expect(deadlineAtFor(base, priority).getTime()).toBe(base.getTime() + hours * HOUR)
  })

  it('falls back to normal for an unknown priority', () => {
    expect(deadlineAtFor(base, 'urgent').getTime()).toBe(
      base.getTime() + DEADLINE_HOURS.normal * HOUR,
    )
  })

  it('accepts a positive override and ignores an invalid one', () => {
    expect(deadlineAtFor(base, 'critical', { critical: 2 }).getTime()).toBe(
      base.getTime() + 2 * HOUR,
    )
    expect(deadlineAtFor(base, 'critical', { critical: 0 }).getTime()).toBe(
      base.getTime() + DEADLINE_HOURS.critical * HOUR,
    )
  })
})

describe('computeTicketTimeline', () => {
  const reportedAt = new Date('2026-11-05T00:00:00.000Z')
  const deadlineAt = new Date(reportedAt.getTime() + 72 * HOUR)

  it('reports green below the yellow threshold', () => {
    const timeline = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      now: new Date(reportedAt.getTime() + 24 * HOUR),
    })

    expect(timeline.percent).toBe(33.33)
    expect(timeline.state).toBe('green')
    expect(timeline.remainingMs).toBe(48 * HOUR)
  })

  it('turns yellow and orange at the documented boundaries', () => {
    const yellow = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      now: new Date(reportedAt.getTime() + 36 * HOUR),
    })
    const orange = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      now: new Date(reportedAt.getTime() + 60 * HOUR),
    })

    expect(yellow.state).toBe('yellow')
    expect(orange.state).toBe('orange')
  })

  it('turns red after the deadline', () => {
    const timeline = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      now: new Date(deadlineAt.getTime() + HOUR),
    })

    expect(timeline.state).toBe('red')
    expect(timeline.remainingMs).toBe(0)
    expect(timeline.percent).toBe(100)
  })

  it('subtracts a closed pause and a still running pause', () => {
    const timeline = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      now: new Date(reportedAt.getTime() + 24 * HOUR),
      pauses: [
        {
          startedAt: new Date(reportedAt.getTime() + 2 * HOUR),
          endedAt: new Date(reportedAt.getTime() + 6 * HOUR),
        },
        { startedAt: new Date(reportedAt.getTime() + 10 * HOUR), endedAt: null },
      ],
    })

    expect(timeline.pausedMs).toBe(18 * HOUR)
    expect(timeline.elapsedMs).toBe(6 * HOUR)
    expect(timeline.remainingMs).toBe(66 * HOUR)
  })

  it('reports stopped when the acknowledgement time is set', () => {
    const timeline = computeTicketTimeline({
      reportedAt,
      deadlineAt,
      stoppedAt: new Date(reportedAt.getTime() + 48 * HOUR),
      now: new Date(deadlineAt.getTime() + 10 * HOUR),
    })

    expect(timeline.state).toBe('stopped')
    expect(timeline.elapsedMs).toBe(48 * HOUR)
    expect(timeline.stoppedAt).toBe('2026-11-07T00:00:00.000Z')
  })
})
