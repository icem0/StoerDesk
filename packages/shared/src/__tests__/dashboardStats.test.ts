import { describe, expect, it } from 'vitest'

import type { TicketStatus } from '../schemas/dashboard.js'
import {
  dashboardSnapshotSchema,
  dashboardSettingsSchema,
  updateDashboardSettingsRequestSchema,
} from '../schemas/dashboard.js'
import {
  complianceResponseSchema,
  declinesResponseSchema,
  frequencyResponseSchema,
  reactionTimesResponseSchema,
  statsFilterSchema,
  statsRangeInvalidCode,
  topObjectsResponseSchema,
} from '../schemas/stats.js'

describe('statsRangeInvalidCode', () => {
  it('is the documented error code for an impossible range', () => {
    expect(statsRangeInvalidCode).toBe('stats_range_invalid')
  })
})

describe('statsFilterSchema', () => {
  it('accepts an empty filter', () => {
    expect(statsFilterSchema.parse({})).toEqual({})
  })

  it('accepts a complete valid filter', () => {
    const input = {
      from: '2026-01-05',
      to: '2026-02-04',
      objectNo: '12345_01',
      systemType: 'BMA',
      priority: 'high',
      technician: '00000000-0000-0000-0000-000000000000',
      includeTest: true,
      includeSpam: false,
      bucket: 'month',
    }

    expect(statsFilterSchema.parse(input)).toEqual(input)
  })

  it('rejects non-calendar dates', () => {
    expect(() => statsFilterSchema.parse({ from: '2026-13-01' })).toThrow()
    expect(() => statsFilterSchema.parse({ to: '2026-02-30' })).toThrow()
    expect(() => statsFilterSchema.parse({ from: '2026-02-29' })).toThrow()
    expect(() => statsFilterSchema.parse({ from: 'not-a-date' })).toThrow()
  })

  it('accepts a real leap day', () => {
    expect(() => statsFilterSchema.parse({ from: '2024-02-29', to: '2024-02-29' })).not.toThrow()
  })

  it('rejects from after to', () => {
    expect(() => statsFilterSchema.parse({ from: '2026-02-01', to: '2026-01-01' })).toThrow()
  })

  it('accepts exactly 366 days and rejects 367', () => {
    expect(() => statsFilterSchema.parse({ from: '2026-01-01', to: '2027-01-01' })).not.toThrow() // 365 days
    expect(() => statsFilterSchema.parse({ from: '2026-01-01', to: '2027-01-02' })).not.toThrow() // exactly 366 days
    expect(() => statsFilterSchema.parse({ from: '2026-01-01', to: '2027-01-03' })).toThrow() // 367 days
    expect(() => statsFilterSchema.parse({ from: '2024-01-01', to: '2025-01-01' })).not.toThrow() // leap year, 366 days
    expect(() => statsFilterSchema.parse({ from: '2024-01-01', to: '2025-01-02' })).toThrow() // 367 days
  })

  it('rejects an unknown priority and a bad bucket', () => {
    expect(() => statsFilterSchema.parse({ priority: 'urgent' })).toThrow()
    expect(() => statsFilterSchema.parse({ bucket: 'quarter' })).toThrow()
  })

  it('rejects a non-UUID technician', () => {
    expect(() => statsFilterSchema.parse({ technician: 'not-a-uuid' })).toThrow()
  })
})

describe('dashboardSnapshotSchema', () => {
  const base = {
    generatedAt: '2026-03-09T10:00:00Z',
    faultFree: { since: '2026-02-01T08:00:00Z', days: 36, recordDays: 120 },
    tiles: {
      open: 3,
      openByStatus: {
        NEW: 1,
        IN_REVIEW: 2,
        WORK_ORDER_CREATED: 0,
        OFFERED: 0,
        ASSIGNED: 0,
        ACCEPTED: 0,
        ACKNOWLEDGED: 0,
        CLOSED: 0,
        CANCELLED: 0,
      } as Record<TicketStatus, number>,
      overdue: 1,
      unreviewed: 1,
      poolSize: 2,
      onCall: null,
      channels: null,
    },
    burningNow: [
      {
        ticketNo: 'ST-2026-0007',
        objectName: 'Feuerwache Nord',
        status: 'ACKNOWLEDGED',
        priority: 'critical',
        deadlineAt: '2026-03-12T07:00:00Z',
        reportedAt: '2026-03-09T08:00:00Z',
        timelineState: 'stopped',
        percent: 12.5,
        remainingMs: 2_700_000,
        lastEvent: { type: 'acknowledged', at: '2026-03-09T11:00:00Z' },
      },
    ],
  }

  it('parses a complete snapshot', () => {
    expect(dashboardSnapshotSchema.parse(base)).toEqual(base)
  })

  it('parses a snapshot with null optional sections', () => {
    const withoutSections = {
      ...base,
      tiles: { ...base.tiles, onCall: null, channels: null },
    }
    expect(dashboardSnapshotSchema.parse(withoutSections)).toEqual(withoutSections)
  })

  it('parses a snapshot with populated on-call and channels sections', () => {
    const withSections = {
      ...base,
      tiles: {
        ...base.tiles,
        onCall: {
          kind: 'confirmed',
          name: 'Muster, Max',
          phone: '+49 30 123456',
          endsAt: '2026-03-10T07:00:00Z',
          warning: null,
        },
        channels: [
          {
            name: 'ntfy',
            lastSentAt: '2026-03-09T09:00:00Z',
            lastFailedAt: null,
            pending: 0,
            failed: 0,
          },
          {
            name: 'smtp',
            lastSentAt: null,
            lastFailedAt: '2026-03-08T20:00:00Z',
            pending: 2,
            failed: 1,
          },
        ],
      },
    }
    expect(dashboardSnapshotSchema.parse(withSections)).toEqual(withSections)
  })

  it('rejects an unknown on-call kind', () => {
    expect(() =>
      dashboardSnapshotSchema.parse({
        ...base,
        tiles: {
          ...base.tiles,
          onCall: {
            kind: 'unknown' as never,
            name: null,
            phone: null,
            endsAt: null,
            warning: null,
          },
        },
      }),
    ).toThrow()
  })
})

describe('dashboardSettingsSchema', () => {
  const validTvToken = 'a'.repeat(43) // 32-byte base64url without padding

  it('accepts valid settings', () => {
    expect(
      dashboardSettingsSchema.parse({
        tvToken: validTvToken,
        tvAnonymize: false,
        conspicuousThreshold: 3,
      }),
    ).toEqual({
      tvToken: validTvToken,
      tvAnonymize: false,
      conspicuousThreshold: 3,
    })
  })

  it('rejects a non-base64url tvToken and out-of-range thresholds', () => {
    expect(() =>
      dashboardSettingsSchema.parse({ tvToken: 'short', tvAnonymize: false, conspicuousThreshold: 3 }),
    ).toThrow()
    expect(() =>
      dashboardSettingsSchema.parse({ tvToken: validTvToken, tvAnonymize: false, conspicuousThreshold: 0 }),
    ).toThrow()
    expect(() =>
      dashboardSettingsSchema.parse({ tvToken: validTvToken, tvAnonymize: false, conspicuousThreshold: 101 }),
    ).toThrow()
  })
})

describe('updateDashboardSettingsRequestSchema', () => {
  it('accepts a partial and an empty update request', () => {
    expect(updateDashboardSettingsRequestSchema.parse({})).toEqual({})
    expect(
      updateDashboardSettingsRequestSchema.parse({ tvAnonymize: true }),
    ).toEqual({ tvAnonymize: true })
  })
})

describe('statistics response schemas', () => {
  it('parses reaction times', () => {
    expect(
      reactionTimesResponseSchema.parse({
        review: { count: 4, medianMinutes: 23, averageMinutes: 30, p90Minutes: 55 },
        firstResponse: { count: 3, medianMinutes: 40, averageMinutes: 45, p90Minutes: 80 },
        acknowledge: { count: 2, medianMinutes: 500, averageMinutes: 520, p90Minutes: 600 },
        pausedTickets: 1,
        pauseMinutes: 90,
      }),
    ).toEqual({
      review: { count: 4, medianMinutes: 23, averageMinutes: 30, p90Minutes: 55 },
      firstResponse: { count: 3, medianMinutes: 40, averageMinutes: 45, p90Minutes: 80 },
      acknowledge: { count: 2, medianMinutes: 500, averageMinutes: 520, p90Minutes: 600 },
      pausedTickets: 1,
      pauseMinutes: 90,
    })
  })

  it('parses frequency', () => {
    expect(
      frequencyResponseSchema.parse({
        series: [{ bucketStart: '2026-01-05T00:00:00Z', total: 7 }],
        bySystemType: [{ key: 'BMA', count: 5 }],
        byFaultTemplate: [{ key: 'bma_alarm', count: 3 }],
        bySource: [{ key: 'QR', count: 2 }],
      }),
    ).toEqual({
      series: [{ bucketStart: '2026-01-05T00:00:00Z', total: 7 }],
      bySystemType: [{ key: 'BMA', count: 5 }],
      byFaultTemplate: [{ key: 'bma_alarm', count: 3 }],
      bySource: [{ key: 'QR', count: 2 }],
    })
  })

  it('parses top objects', () => {
    expect(
      topObjectsResponseSchema.parse({
        topObjects: [
          { objectNo: '12345_01', objectName: 'Feuerwache Nord', count: 12, conspicuous: true },
        ],
      }),
    ).toEqual({
      topObjects: [
        { objectNo: '12345_01', objectName: 'Feuerwache Nord', count: 12, conspicuous: true },
      ],
    })
  })

  it('parses compliance with a null rate', () => {
    expect(
      complianceResponseSchema.parse({
        acknowledged: 0,
        onTime: 0,
        late: 0,
        openOverdue: 3,
        onTimeRate: null,
      }),
    ).toEqual({
      acknowledged: 0,
      onTime: 0,
      late: 0,
      openOverdue: 3,
      onTimeRate: null,
    })
  })

  it('parses declines', () => {
    expect(
      declinesResponseSchema.parse({
        declineRate: 0.25,
        topReasons: [{ reason: 'keine zeit', count: 4 }],
      }),
    ).toEqual({
      declineRate: 0.25,
      topReasons: [{ reason: 'keine zeit', count: 4 }],
    })
  })
})
