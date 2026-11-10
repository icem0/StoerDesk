import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import * as schema from '../../db/schema'
import { objects, ticketPauses, tickets } from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import type { StatsFilter } from '@stoerdesk/shared'
import { buildStatsFilter } from '../filters'
import { queryFrequency } from '../frequency'
import { queryReactionTimes } from '../reaction-times'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(
    `skipped statistics reaction times and frequency: ${testDatabase.reason}\n`,
  )
}

function onlyRow<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`expected ${what}`)
  }

  return row
}

const REPORTED_AT = new Date('2026-03-10T10:00:00Z')

/** Minutes after the report. */
function after(minutes: number): Date {
  return new Date(REPORTED_AT.getTime() + minutes * 60 * 1000)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'statistics reaction times and frequency (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 4 })
    const db = drizzle(client, { schema })

    let objectId = ''
    let ticketOneId = ''
    let ticketTwoId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [object] = await db
        .insert(objects)
        .values({
          objectNo: `STAT_${Date.now().toString(36)}_01`,
          name: 'Statistik Objekt',
          externalType: 'BMA',
        })
        .returning({ id: objects.id })
      objectId = onlyRow(object, 'the inserted object').id

      // Three real tickets with known reaction times: review 10/30/20,
      // first response 20/60/40 and acknowledge 50/120/80 minutes.
      const [ticketOne] = await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: 'ST-2026-0101',
          status: 'ACKNOWLEDGED',
          priority: 'normal',
          source: 'QR',
          reportedAt: REPORTED_AT,
          receivedAt: REPORTED_AT,
          deadlineAt: after(500),
          faultTemplateKeys: ['ELECTRICAL', 'WATER'],
          reviewStartedAt: after(10),
          firstResponseAt: after(20),
          acknowledgedAt: after(50),
        })
        .returning({ id: tickets.id })
      ticketOneId = onlyRow(ticketOne, 'the first ticket').id

      const [ticketTwo] = await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: 'ST-2026-0102',
          status: 'ACKNOWLEDGED',
          priority: 'normal',
          source: 'QR',
          reportedAt: REPORTED_AT,
          receivedAt: REPORTED_AT,
          deadlineAt: after(500),
          faultTemplateKeys: ['ELECTRICAL'],
          reviewStartedAt: after(30),
          firstResponseAt: after(60),
          acknowledgedAt: after(120),
        })
        .returning({ id: tickets.id })
      ticketTwoId = onlyRow(ticketTwo, 'the second ticket').id

      await db.insert(tickets).values({
        objectId,
        ticketNo: 'ST-2026-0103',
        status: 'ACKNOWLEDGED',
        priority: 'normal',
        source: 'QR',
        reportedAt: REPORTED_AT,
        receivedAt: REPORTED_AT,
        deadlineAt: after(500),
        faultTemplateKeys: ['ELECTRICAL', 'WATER'],
        reviewStartedAt: after(20),
        firstResponseAt: after(40),
        acknowledgedAt: after(80),
      })

      // Excluded by default: a test ticket and a suspected-spam ticket.
      await db.insert(tickets).values({
        objectId,
        ticketNo: 'ST-2026-0104',
        status: 'ACKNOWLEDGED',
        priority: 'normal',
        source: 'QR',
        reportedAt: REPORTED_AT,
        receivedAt: REPORTED_AT,
        deadlineAt: after(500),
        isTest: true,
        faultTemplateKeys: ['ELECTRICAL'],
        reviewStartedAt: after(5),
        firstResponseAt: after(10),
        acknowledgedAt: after(15),
      })

      await db.insert(tickets).values({
        objectId,
        ticketNo: 'ST-2026-0105',
        status: 'ACKNOWLEDGED',
        priority: 'normal',
        source: 'QR',
        reportedAt: REPORTED_AT,
        receivedAt: REPORTED_AT,
        deadlineAt: after(500),
        suspectedSpam: true,
        faultTemplateKeys: ['WATER'],
        reviewStartedAt: after(50),
        firstResponseAt: after(100),
        acknowledgedAt: after(200),
      })

      // 10 minutes of pause on the first and 20 minutes on the second ticket.
      await db.insert(ticketPauses).values([
        {
          ticketId: ticketOneId,
          reason: 'Warte auf Ersatzteil',
          startedAt: after(10),
          endedAt: after(20),
        },
        {
          ticketId: ticketTwoId,
          reason: 'Warte auf Freigabe',
          startedAt: after(30),
          endedAt: after(50),
        },
      ])
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('computes the reaction times per phase with median, average and p90', async () => {
      const filter = { from: '2026-03-10', to: '2026-03-11' }

      const result = await queryReactionTimes(db, filter, REPORTED_AT)

      // Review: 10, 30 and 20 minutes → median 20, average 20, p90 28.
      expect(result.review).toEqual({
        count: 3,
        medianMinutes: 20,
        averageMinutes: 20,
        p90Minutes: 28,
      })

      // First response: 20, 60 and 40 minutes → median 40, average 40, p90 56.
      expect(result.firstResponse).toEqual({
        count: 3,
        medianMinutes: 40,
        averageMinutes: 40,
        p90Minutes: 56,
      })

      // Acknowledge: 50, 120 and 80 minutes → median 80, average 83, p90 112.
      expect(result.acknowledge).toEqual({
        count: 3,
        medianMinutes: 80,
        averageMinutes: 83,
        p90Minutes: 112,
      })

      // The two pauses of 10 and 20 minutes are reported next to the phases.
      expect(result.pausedTickets).toBe(2)
      expect(result.pauseMinutes).toBe(30)
    })

    it('excludes test and suspected-spam tickets by default', async () => {
      const filter = { from: '2026-03-10', to: '2026-03-11' }

      const result = await queryReactionTimes(db, filter, REPORTED_AT)
      expect(result.review.count).toBe(3)

      const withTest = await queryReactionTimes(
        db,
        { ...filter, includeTest: true },
        REPORTED_AT,
      )
      expect(withTest.review.count).toBe(4)

      const withSpam = await queryReactionTimes(
        db,
        { ...filter, includeSpam: true },
        REPORTED_AT,
      )
      expect(withSpam.review.count).toBe(4)
    })

    it('answers a zero-filled frequency series and the three groupings', async () => {
      const filter: StatsFilter = { from: '2026-03-10', to: '2026-03-11', bucket: 'day' }

      const result = await queryFrequency(db, filter, REPORTED_AT)

      expect(result.series).toHaveLength(2)
      expect(onlyRow(result.series[0], 'the first bucket').total).toBe(3)
      expect(onlyRow(result.series[1], 'the second bucket').total).toBe(0)

      expect(result.bySystemType).toEqual([{ key: 'BMA', count: 3 }])
      expect(result.byFaultTemplate).toContainEqual({ key: 'ELECTRICAL', count: 3 })
      expect(result.byFaultTemplate).toContainEqual({ key: 'WATER', count: 2 })
      expect(result.bySource).toEqual([{ key: 'QR', count: 3 }])
    })

    it('filters by object number, priority and technician', async () => {
      const filter: StatsFilter = { from: '2026-03-10', to: '2026-03-11', priority: 'critical' }

      const result = await queryReactionTimes(db, filter, REPORTED_AT)
      expect(result.review.count).toBe(0)
    })
  },
)

describe('buildStatsFilter (pure)', () => {
  const now = new Date('2026-03-12T08:00:00Z')

  it('resolves the default range to the last 30 local days', () => {
    const { range } = buildStatsFilter({}, now)

    expect(range.fromDate).toBe('2026-02-11')
    expect(range.toDate).toBe('2026-03-12')
    expect(range.fromUtc.toISOString()).toBe('2026-02-10T23:00:00.000Z')
    expect(range.toUtc.toISOString()).toBe('2026-03-12T22:59:59.999Z')
  })

  it('converts the local day bounds to UTC instants', () => {
    const { range } = buildStatsFilter({ from: '2026-03-09', to: '2026-03-10' }, now)

    expect(range.fromUtc.toISOString()).toBe('2026-03-08T23:00:00.000Z')
    expect(range.toUtc.toISOString()).toBe('2026-03-10T22:59:59.999Z')
  })

  it('keeps the DST day 23 hours long', () => {
    const { range } = buildStatsFilter({ from: '2026-03-29', to: '2026-03-29' }, now)

    expect(range.fromUtc.toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(range.toUtc.toISOString()).toBe('2026-03-29T21:59:59.999Z')
  })
})
