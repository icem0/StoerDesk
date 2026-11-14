import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { createInternalTicket } from '../internal'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal notification integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'internal ticket notifications (WP-M14-20)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let actorUserId = ''
    let objectId = ''

    const previousNtfyUrl = process.env.NTFY_URL
    const previousNtfyTopic = process.env.NTFY_TOPIC

    beforeAll(async () => {
      process.env.NTFY_URL = 'https://ntfy.sh'
      process.env.NTFY_TOPIC = 'stoerdesk-internal-test'

      await migrate(db, { migrationsFolder })

      const [actor] = await db
        .insert(schema.users)
        .values({
          email: `recorder-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: schema.users.id })
      actorUserId = actor?.id ?? ''

      const [object] = await db
        .insert(schema.objects)
        .values({
          objectNo: `IN-${randomUUID().slice(0, 6)}`,
          name: 'Aufzug Rathaus',
          street: 'Marktplatz',
          houseNumber: '1',
          postalCode: '12345',
          city: 'Musterstadt',
          externalType: 'BMA',
        })
        .returning({ id: schema.objects.id })
      objectId = object?.id ?? ''
    })

    afterAll(async () => {
      if (previousNtfyUrl === undefined) {
        delete process.env.NTFY_URL
      } else {
        process.env.NTFY_URL = previousNtfyUrl
      }

      if (previousNtfyTopic === undefined) {
        delete process.env.NTFY_TOPIC
      } else {
        process.env.NTFY_TOPIC = previousNtfyTopic
      }

      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    function input() {
      return {
        objectId,
        title: undefined,
        description: 'Aufzug steckt zwischen zwei Etagen',
        priority: 'normal' as const,
        faultTemplateKeys: [],
      }
    }

    it('writes the ntfy outbox row in the transaction of the office ticket', async () => {
      const created = await createInternalTicket(db, input(), actorUserId)

      const rows = await db
        .select()
        .from(schema.outbox)
        .where(eq(schema.outbox.ticketId, created.ticketId))

      const ntfy = rows.find((row) => row.channel === 'ntfy')

      expect(ntfy).toBeDefined()
      expect(ntfy?.target).toMatchObject({
        ticketNo: created.ticketNo,
        priority: 'normal',
        objectName: 'Aufzug Rathaus',
        objectLocation: 'Marktplatz 1 12345 Musterstadt',
        systemType: 'BMA',
        shortText: 'Aufzug steckt zwischen zwei Etagen',
      })
    })

    it('rolls the outbox row back together with the ticket', async () => {
      let rolledBackTicketId = ''

      await expect(
        db.transaction(async (tx) => {
          const created = await createInternalTicket(
            tx as unknown as Parameters<typeof createInternalTicket>[0],
            input(),
            actorUserId,
          )
          rolledBackTicketId = created.ticketId
          throw new Error('forced rollback')
        }),
      ).rejects.toThrow('forced rollback')

      expect(rolledBackTicketId).not.toBe('')

      const [ticket] = await db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(eq(schema.tickets.id, rolledBackTicketId))
        .limit(1)

      const rows = await db
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .where(eq(schema.outbox.ticketId, rolledBackTicketId))

      expect(ticket).toBeUndefined()
      expect(rows).toHaveLength(0)
    })
  },
)
