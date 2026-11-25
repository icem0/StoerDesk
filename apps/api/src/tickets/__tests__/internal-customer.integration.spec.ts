import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { createInternalTicket } from '../internal'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal customer integration: ${testDatabase.reason}\n`)
}

const { objectAssignments, objects, roles, tickets, userRoles, users } = schema

describe.skipIf(testDatabase.status === 'unavailable')(
  'the customer of the internal report (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let actorUserId = ''
    let customerUserId = ''
    let strangerUserId = ''
    let objectId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const [actor] = await db
        .insert(users)
        .values({
          email: `actor-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: users.id })
      actorUserId = actor?.id ?? ''

      const [customer] = await db
        .insert(users)
        .values({
          email: `customer-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
          givenName: 'Erika',
          familyName: 'Mustermann',
        })
        .returning({ id: users.id })
      customerUserId = customer?.id ?? ''

      const [stranger] = await db
        .insert(users)
        .values({
          email: `stranger-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: users.id })
      strangerUserId = stranger?.id ?? ''

      const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'customer'))

      await db.insert(userRoles).values({ userId: customerUserId, roleId: role!.id })

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `IC-${randomUUID().slice(0, 6)}`, name: 'Kundenprobe' })
        .returning({ id: objects.id })
      objectId = object?.id ?? ''

      await db.insert(objectAssignments).values({
        objectId,
        userId: customerUserId,
        createdByUserId: null,
      })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function createTicket(customerUserIdInput?: string) {
      return createInternalTicket(
        db,
        {
          objectId,
          title: undefined,
          description: 'Der Melder piept',
          priority: 'normal',
          faultTemplateKeys: [],
          photos: [],
          contact: undefined,
          reporterChannel: undefined,
          reporterKind: undefined,
          reportedByUserId: undefined,
          customerUserId: customerUserIdInput,
          reportedAt: undefined,
        },
        actorUserId,
      )
    }

    it('names the customer of the ticket', async () => {
      const ticket = await createTicket(customerUserId)

      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.ticketId))

      expect(row?.customerUserId).toBe(customerUserId)
    })

    it('refuses a customer that is not a trained person of the object', async () => {
      await expect(createTicket(strangerUserId)).rejects.toMatchObject({
        code: 'customer_not_found',
      })
    })

    it('leaves the ticket without a customer when nobody was chosen', async () => {
      const ticket = await createTicket()

      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.ticketId))

      expect(row?.customerUserId).toBeNull()
    })
  },
)
