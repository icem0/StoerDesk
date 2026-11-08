import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { evaluateEscalations } from '../../tickets/escalation'
import { escalateOnCallOffers } from '../coupling'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call offer timeout: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets, users } = schema
const MINUTE = 60 * 1000

describe.skipIf(testDatabase.status === 'unavailable')(
  'on-call offer timeout escalation (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let objectId = ''
    let userId = ''
    const now = new Date('2026-11-05T12:00:00.000Z')

    async function createTicket(input: {
      status: string
      offerEscalatedAt: Date | null
      offeredToUserId: string | null
    }): Promise<{ id: string; ticketNo: string }> {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          ticketNo: `ST-OFFER-${randomUUID().slice(0, 8)}`,
          status: input.status,
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: new Date(now.getTime() - 30 * MINUTE),
          receivedAt: new Date(now.getTime() - 30 * MINUTE),
          deadlineAt: new Date(now.getTime() + 120 * MINUTE),
          offeredToUserId: input.offeredToUserId,
          offerEscalatedAt: input.offerEscalatedAt,
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      if (ticket === undefined) {
        throw new Error('ticket insert failed')
      }

      return ticket
    }

    async function stored(ticketId: string) {
      const [row] = await db
        .select({
          status: tickets.status,
          offeredToUserId: tickets.offeredToUserId,
          offerEscalatedAt: tickets.offerEscalatedAt,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))

      return row
    }

    async function escalationEvents(ticketId: string) {
      return await db
        .select({ payload: ticketEvents.payload })
        .from(ticketEvents)
        .where(
          and(
            eq(ticketEvents.ticketId, ticketId),
            eq(ticketEvents.type, 'offer_escalated'),
          ),
        )
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `OFFER-${randomUUID().slice(0, 6)}`, name: 'Offer probe' })
        .returning({ id: objects.id })
      objectId = object?.id ?? ''

      const [technician] = await db
        .insert(users)
        .values({ email: `offer-${randomUUID().slice(0, 8)}@example.org`, passwordHash: 'no-login' })
        .returning({ id: users.id })
      userId = technician?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('escalates an offer exactly at the threshold', async () => {
      const ticket = await createTicket({
        status: 'OFFERED',
        offeredToUserId: userId,
        offerEscalatedAt: now,
      })

      const result = await escalateOnCallOffers(db, now)

      expect(result.scanned).toBeGreaterThanOrEqual(1)
      expect(result.escalated).toBe(1)
      expect(await stored(ticket.id)).toMatchObject({
        status: 'OFFERED',
        offeredToUserId: null,
        offerEscalatedAt: null,
      })
      expect(await escalationEvents(ticket.id)).toEqual([
        { payload: { reason: 'oncall_timeout' } },
      ])
    })

    it('does not escalate before the threshold', async () => {
      const ticket = await createTicket({
        status: 'OFFERED',
        offeredToUserId: userId,
        offerEscalatedAt: new Date(now.getTime() + MINUTE),
      })

      await escalateOnCallOffers(db, now)

      expect(await stored(ticket.id)).toMatchObject({
        offeredToUserId: userId,
        offerEscalatedAt: new Date(now.getTime() + MINUTE),
      })
      expect(await escalationEvents(ticket.id)).toEqual([])
    })

    it('is a no-op on a second scan', async () => {
      const ticket = await createTicket({
        status: 'OFFERED',
        offeredToUserId: userId,
        offerEscalatedAt: new Date(now.getTime() - MINUTE),
      })

      const first = await escalateOnCallOffers(db, now)
      expect(first.escalated).toBe(1)

      const second = await escalateOnCallOffers(db, now)
      expect(second.escalated).toBe(0)
      expect(await escalationEvents(ticket.id)).toHaveLength(1)
    })

    it('skips a ticket that left OFFERED', async () => {
      const ticket = await createTicket({
        status: 'ASSIGNED',
        offeredToUserId: userId,
        offerEscalatedAt: new Date(now.getTime() - MINUTE),
      })

      await escalateOnCallOffers(db, now)

      expect(await stored(ticket.id)).toMatchObject({
        status: 'ASSIGNED',
        offeredToUserId: userId,
      })
      expect(await escalationEvents(ticket.id)).toEqual([])
    })

    it('runs inside the minute escalation scan', async () => {
      const ticket = await createTicket({
        status: 'OFFERED',
        offeredToUserId: userId,
        offerEscalatedAt: new Date(now.getTime() - MINUTE),
      })

      const result = await evaluateEscalations(db, now)

      expect(result.offerEscalated).toBeGreaterThanOrEqual(1)
      expect(await escalationEvents(ticket.id)).toHaveLength(1)
    })
  },
)
