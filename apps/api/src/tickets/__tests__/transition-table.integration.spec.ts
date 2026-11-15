import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { transitionTicket } from '../workflow'

/**
 * The workflow engine of WP-M14-38c resolves the step of `(current status, event)`
 * in the rows of `ticket_transitions` (`specs/07-escalation.md` §7.13, ADR-0025):
 * the row decides the new status, the event decides which timestamp column is
 * written. An unknown or deactivated combination answers `409 invalid_transition`,
 * and a row the administration edited moves the ticket to the status the row names.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped transition table integration: ${testDatabase.reason}\n`)
}

const { ticketTransitions } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'ticket transitions — the engine reads the row table (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function openTicket(): Promise<string> {
      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: `TT-${randomUUID().slice(0, 6)}`, name: 'Transition table probe' })
        .returning({ id: schema.objects.id })
      const now = new Date()
      const [ticket] = await db
        .insert(schema.tickets)
        .values({
          objectId: object?.id ?? '',
          status: 'NEW',
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        })
        .returning({ id: schema.tickets.id, ticketNo: schema.tickets.ticketNo })

      return `${ticket?.id ?? ''}|${ticket?.ticketNo ?? ''}`
    }

    async function statusOf(ticketNo: string | undefined): Promise<string | null> {
      const [row] = await db
        .select({ status: schema.tickets.status })
        .from(schema.tickets)
        .where(eq(schema.tickets.ticketNo, ticketNo ?? ''))
        .limit(1)

      return row?.status ?? null
    }

    it('moves a NEW ticket to the status the seeded row names', async () => {
      const [ticketId, ticketNo] = (await openTicket()).split('|')

      await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'review_started' })

      expect(await statusOf(ticketNo)).toBe('IN_REVIEW')
    })

    it('answers 409 invalid_transition for an event with no row', async () => {
      const [ticketId, ticketNo] = (await openTicket()).split('|')

      await expect(
        transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'closed' }),
      ).rejects.toMatchObject({
        code: 'invalid_transition',
        statusCode: 409,
        params: { ticketNo, from: 'NEW', event: 'closed' },
      })

      expect(await statusOf(ticketNo)).toBe('NEW')
    })

    it('blocks the step of a row the test deactivates', async () => {
      await db
        .update(ticketTransitions)
        .set({ active: false })
        .where(
          and(
            eq(ticketTransitions.fromStatus, 'NEW'),
            eq(ticketTransitions.eventKey, 'review_started'),
          ),
        )

      const [ticketId, ticketNo] = (await openTicket()).split('|')

      await expect(
        transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'review_started' }),
      ).rejects.toMatchObject({
        code: 'invalid_transition',
        statusCode: 409,
        params: { ticketNo, from: 'NEW', event: 'review_started' },
      })

      expect(await statusOf(ticketNo)).toBe('NEW')
    })

    it('moves the ticket to the status an edited row names', async () => {
      await db
        .update(ticketTransitions)
        .set({ toStatus: 'OFFERED', active: true })
        .where(
          and(
            eq(ticketTransitions.fromStatus, 'NEW'),
            eq(ticketTransitions.eventKey, 'review_started'),
          ),
        )

      const [ticketId, ticketNo] = (await openTicket()).split('|')

      await transitionTicket({ database: db, ticketId: ticketId ?? '', event: 'review_started' })

      expect(await statusOf(ticketNo)).toBe('OFFERED')
    })
  },
)
