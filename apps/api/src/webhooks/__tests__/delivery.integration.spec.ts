import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { collectPendingWebhooks, processWebhookDeliveries } from '../delivery'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped webhook delivery integration: ${testDatabase.reason}\n`)
}

const { objects, ticketEvents, tickets, webhookDeliveries, webhookEndpoints } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'webhook delivery worker — collection, idempotency and sending (integration)',
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

    it('queues one row per active subscribed endpoint and sends it', async () => {
      const object = onlyRow(
        await db
          .insert(objects)
          .values({ objectNo: 'WH-1', name: 'Rathaus', qrToken: 'webhook-qr-token' })
          .returning({ id: objects.id }),
        'object',
      )
      const ticket = onlyRow(
        await db
          .insert(tickets)
          .values({
            objectId: object.id,
            reportedAt: new Date(),
            deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          })
          .returning({ id: tickets.id, ticketNo: tickets.ticketNo }),
        'ticket',
      )

      const both = onlyRow(
        await db
          .insert(webhookEndpoints)
          .values({
            url: 'https://example.org/both',
            secret: 'whsec_both',
            events: ['ticket.created', 'ticket.status_changed'],
          })
          .returning({ id: webhookEndpoints.id }),
        'both endpoint',
      )
      const createdOnly = onlyRow(
        await db
          .insert(webhookEndpoints)
          .values({
            url: 'https://example.org/created',
            secret: 'whsec_created',
            events: ['ticket.created'],
          })
          .returning({ id: webhookEndpoints.id }),
        'created endpoint',
      )
      const inactive = onlyRow(
        await db
          .insert(webhookEndpoints)
          .values({
            url: 'https://example.org/inactive',
            secret: 'whsec_inactive',
            events: ['ticket.created', 'ticket.status_changed'],
            active: false,
          })
          .returning({ id: webhookEndpoints.id }),
        'inactive endpoint',
      )

      await db.insert(ticketEvents).values([
        { ticketId: ticket.id, type: 'created', actorKind: 'public' },
        { ticketId: ticket.id, type: 'closed', actorKind: 'user' },
      ])

      expect(await collectPendingWebhooks(db)).toBe(3)
      expect(await collectPendingWebhooks(db)).toBe(0)

      const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
      const result = await processWebhookDeliveries(db, new Date(), undefined, fetchImpl)

      expect(result).toEqual({ sent: 3, failed: 0, retried: 0 })

      const sent = await db
        .select({ status: webhookDeliveries.status, attempts: webhookDeliveries.attempts })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.status, 'SENT'))

      expect(sent).toHaveLength(3)
      expect(sent.every((row) => row.attempts === 1)).toBe(true)

      const inactiveRows = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, inactive.id))

      expect(inactiveRows).toEqual([])

      const events = await db
        .select({ eventType: webhookDeliveries.eventType })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, both.id))

      expect(events.map((row) => row.eventType).sort()).toEqual([
        'ticket.created',
        'ticket.status_changed',
      ])

      const createdRows = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.endpointId, createdOnly.id),
            eq(webhookDeliveries.eventType, 'ticket.created'),
          ),
        )

      expect(createdRows).toHaveLength(1)

      const header = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>

      expect(header['x-stoerdesk-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
      expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('whsec_both')
      expect(ticket.ticketNo).toMatch(/^ST-/)
    })
  },
)
