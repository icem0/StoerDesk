import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import * as schema from '../../db/schema'
import { objects, ticketEvents, tickets } from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import type { StatsFilter } from '@stoerdesk/shared'
import { queryCompliance, queryDeclines } from '../compliance'
import { queryTopObjects } from '../objects'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(
    `skipped statistics objects and compliance: ${testDatabase.reason}\n`,
  )
}

function onlyRow<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`expected ${what}`)
  }

  return row
}

const SUFFIX = Date.now().toString(36)
const REPORTED_AT = new Date('2026-03-10T10:00:00Z')
const NOW = new Date('2026-03-12T12:00:00Z')

/** Minutes after `REPORTED_AT`. */
function after(minutes: number): Date {
  return new Date(REPORTED_AT.getTime() + minutes * 60 * 1000)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'statistics objects, compliance and declines (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 4 })
    const db = drizzle(client, { schema })

    let topObjectId = ''
    let topObjectNo = ''
    let sparseObjectId = ''
    let sparseObjectNo = ''
    let complianceObjectId = ''
    let complianceObjectNo = ''
    let declineObjectId = ''
    let declineObjectNo = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [topObject] = await db
        .insert(objects)
        .values({ objectNo: `STAT_${SUFFIX}_A`, name: 'Objekt A', externalType: 'BMA' })
        .returning({ id: objects.id, objectNo: objects.objectNo })
      const [sparseObject] = await db
        .insert(objects)
        .values({ objectNo: `STAT_${SUFFIX}_B`, name: 'Objekt B', externalType: 'RWA' })
        .returning({ id: objects.id, objectNo: objects.objectNo })
      const [complianceObject] = await db
        .insert(objects)
        .values({ objectNo: `STAT_${SUFFIX}_C`, name: 'Objekt C' })
        .returning({ id: objects.id, objectNo: objects.objectNo })
      const [declineObject] = await db
        .insert(objects)
        .values({ objectNo: `STAT_${SUFFIX}_D`, name: 'Objekt D' })
        .returning({ id: objects.id, objectNo: objects.objectNo })

      const top = onlyRow(topObject, 'the top object')
      const sparse = onlyRow(sparseObject, 'the sparse object')
      const compliance = onlyRow(complianceObject, 'the compliance object')
      const decline = onlyRow(declineObject, 'the decline object')

      topObjectId = top.id
      topObjectNo = top.objectNo
      sparseObjectId = sparse.id
      sparseObjectNo = sparse.objectNo
      complianceObjectId = compliance.id
      complianceObjectNo = compliance.objectNo
      declineObjectId = decline.id
      declineObjectNo = decline.objectNo

      const baseTicket = {
        status: 'ACKNOWLEDGED',
        priority: 'normal',
        source: 'QR' as const,
        receivedAt: REPORTED_AT,
        deadlineAt: after(500),
      }

      // Top object: two tickets in range, three in the 90-day window before it.
      await db.insert(tickets).values([
        { ...baseTicket, objectId: topObjectId, ticketNo: `ST-${SUFFIX}-T1`, reportedAt: REPORTED_AT },
        { ...baseTicket, objectId: topObjectId, ticketNo: `ST-${SUFFIX}-T2`, reportedAt: REPORTED_AT },
        {
          ...baseTicket,
          objectId: topObjectId,
          ticketNo: `ST-${SUFFIX}-T3`,
          reportedAt: new Date('2026-02-10T10:00:00Z'),
        },
        {
          ...baseTicket,
          objectId: topObjectId,
          ticketNo: `ST-${SUFFIX}-T4`,
          reportedAt: new Date('2026-02-11T10:00:00Z'),
        },
        {
          ...baseTicket,
          objectId: topObjectId,
          ticketNo: `ST-${SUFFIX}-T5`,
          reportedAt: new Date('2026-02-12T10:00:00Z'),
        },
      ])

      // Sparse object: a single ticket in range.
      await db.insert(tickets).values({
        ...baseTicket,
        objectId: sparseObjectId,
        ticketNo: `ST-${SUFFIX}-S1`,
        reportedAt: REPORTED_AT,
      })

      // Compliance object: one on-time, one late, one unacknowledged overdue.
      await db.insert(tickets).values([
        {
          ...baseTicket,
          objectId: complianceObjectId,
          ticketNo: `ST-${SUFFIX}-C1`,
          reportedAt: REPORTED_AT,
          deadlineAt: after(120),
          acknowledgedAt: after(60),
        },
        {
          ...baseTicket,
          objectId: complianceObjectId,
          ticketNo: `ST-${SUFFIX}-C2`,
          reportedAt: REPORTED_AT,
          deadlineAt: after(60),
          acknowledgedAt: after(120),
        },
        {
          ...baseTicket,
          objectId: complianceObjectId,
          ticketNo: `ST-${SUFFIX}-C3`,
          status: 'ASSIGNED',
          reportedAt: REPORTED_AT,
          deadlineAt: new Date('2026-03-11T10:00:00Z'),
          acknowledgedAt: null,
        },
      ])

      // Decline object: three tickets reached the distribution step, two were declined.
      const declineTickets = await db
        .insert(tickets)
        .values([
          {
            ...baseTicket,
            objectId: declineObjectId,
            ticketNo: `ST-${SUFFIX}-D1`,
            status: 'OFFERED',
            reportedAt: REPORTED_AT,
            acknowledgedAt: null,
          },
          {
            ...baseTicket,
            objectId: declineObjectId,
            ticketNo: `ST-${SUFFIX}-D2`,
            status: 'WORK_ORDER_CREATED',
            reportedAt: REPORTED_AT,
            acknowledgedAt: null,
          },
          {
            ...baseTicket,
            objectId: declineObjectId,
            ticketNo: `ST-${SUFFIX}-D3`,
            status: 'ASSIGNED',
            reportedAt: REPORTED_AT,
            acknowledgedAt: null,
          },
        ])
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      const byNo = new Map(declineTickets.map((row) => [row.ticketNo, row.id]))
      const ticketId = (ticketNo: string): string => {
        const id = byNo.get(ticketNo)

        if (id === undefined) {
          throw new Error(`expected the inserted ticket ${ticketNo}`)
        }

        return id
      }

      await db.insert(ticketEvents).values([
        {
          ticketId: ticketId(`ST-${SUFFIX}-D1`),
          type: 'declined',
          actorKind: 'user',
          payload: { reason: '  Too Far  ' },
        },
        {
          ticketId: ticketId(`ST-${SUFFIX}-D2`),
          type: 'offered',
          actorKind: 'user',
          payload: {},
        },
        {
          ticketId: ticketId(`ST-${SUFFIX}-D2`),
          type: 'declined',
          actorKind: 'user',
          payload: { reason: 'too far' },
        },
      ])
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('answers the top objects and marks the conspicuous one above the threshold', async () => {
      const filter: StatsFilter = { from: '2026-03-10', to: '2026-03-11' }

      const result = await queryTopObjects(db, filter, { conspicuousThreshold: 3 }, NOW)

      expect(result).toEqual([
        { objectNo: topObjectNo, objectName: 'Objekt A', count: 2, conspicuous: true },
        { objectNo: sparseObjectNo, objectName: 'Objekt B', count: 1, conspicuous: false },
      ])
    })

    it('computes deadline compliance, late tickets and the open overdue count', async () => {
      const filter: StatsFilter = {
        from: '2026-03-10',
        to: '2026-03-11',
        objectNo: complianceObjectNo,
      }

      const result = await queryCompliance(db, filter, NOW)

      expect(result).toEqual({
        acknowledged: 2,
        onTime: 1,
        late: 1,
        openOverdue: 1,
        onTimeRate: 0.5,
      })
    })

    it('computes the decline rate and normalizes the top reasons', async () => {
      const filter: StatsFilter = {
        from: '2026-03-10',
        to: '2026-03-11',
        objectNo: declineObjectNo,
      }

      const result = await queryDeclines(db, filter, NOW)

      expect(result.declineRate).toBeCloseTo(2 / 3, 5)
      expect(result.topReasons).toEqual([{ reason: 'too far', count: 2 }])
    })
  },
)
