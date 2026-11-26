import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { generateQrToken } from '../../objects/qr'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped qr registration integration: ${testDatabase.reason}\n`)
}

const {
  objectAssignments,
  objects,
  roles,
  tickets,
  userRoles,
  users,
  settings,
  notificationChannels,
} = schema

type ErrorBody = { code?: string }

describe.skipIf(testDatabase.status === 'unavailable')(
  'the report by QR code registers the customer (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let qrToken = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      // §19.13 (ADR-0062): the registration needs a cleanly set up mailbox.
      await db.insert(notificationChannels).values({
        name: 'E-Mail',
        kind: 'email',
        enabled: true,
        label: 'SMTP',
        config: { host: '127.0.0.1', port: '1', from: 'stoerdesk@example.org' },
      })

      // §19.13 (ADR-0062): the portal of the customer is switched off by
      // default — the tests of the portal switch it on.
      await db.insert(settings).values([
        { key: 'customer.portal_enabled', value: true },
        { key: 'customer.registration_enabled', value: true },
      ])
      await seedRbac(db)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const [object] = await db
        .insert(objects)
        .values({
          objectNo: `QR${Date.now().toString().slice(-6)}`,
          name: 'Melder EG',
          qrToken: generateQrToken(),
        })
        .returning({ qrToken: objects.qrToken })

      qrToken = object!.qrToken ?? ''
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    function report(payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/public/tickets',
        headers: { 'content-type': 'application/json' },
        payload: {
          qrToken,
          clientUuid: crypto.randomUUID(),
          text: 'Der Rauchmelder piept',
          contact: { phone: '000' },
          ...payload,
        },
      })
    }

    it('refuses a report without the confirmation of the trained person', async () => {
      const answer = await report({ trainedPersonConfirmed: false })

      expect(answer.statusCode).toBe(400)
      expect((answer.json() as ErrorBody).code).toBe('trained_person_confirmation_required')
    })

    it('refuses the opt-in for the messages without an address', async () => {
      const answer = await report({
        trainedPersonConfirmed: true,
        emailNotifications: true,
      })

      expect(answer.statusCode).toBe(422)
      expect((answer.json() as ErrorBody).code).toBe('email_notifications_need_email')
    })

    it('registers the reporter, links the object and names the customer of the ticket', async () => {
      const email = `qr-kunde-${Date.now()}@example.org`

      const answer = await report({
        trainedPersonConfirmed: true,
        emailNotifications: true,
        register: { email },
        contact: { phone: '000', email },
      })

      expect(answer.statusCode).toBe(201)

      const [user] = await db.select().from(users).where(eq(users.email, email))

      expect(user).toBeDefined()
      expect(user?.active).toBe(false)

      const [role] = await db
        .select({ key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, user!.id))

      expect(role?.key).toBe('customer')

      const assignments = await db
        .select()
        .from(objectAssignments)
        .where(eq(objectAssignments.userId, user!.id))

      expect(assignments).toHaveLength(1)

      const [ticket] = await db.select().from(tickets).where(eq(tickets.customerUserId, user!.id))

      expect(ticket).toBeDefined()
      expect(ticket?.customerEmailNotifications).toBe(true)
      expect(ticket?.trainedPersonConfirmed).toBe(true)
    })

    it('takes the customer of the report over into the object and the ticket', async () => {
      const email = `qr-wieder-${Date.now()}@example.org`

      const first = await report({
        trainedPersonConfirmed: true,
        register: { email },
        contact: { phone: '000', email },
      })

      expect(first.statusCode).toBe(201)

      const second = await report({
        trainedPersonConfirmed: true,
        register: { email },
        contact: { phone: '000', email },
      })

      expect(second.statusCode).toBe(201)

      const [user] = await db.select().from(users).where(eq(users.email, email))

      const assignments = await db
        .select()
        .from(objectAssignments)
        .where(eq(objectAssignments.userId, user!.id))

      expect(assignments).toHaveLength(1)

      const customerTickets = await db
        .select()
        .from(tickets)
        .where(eq(tickets.customerUserId, user!.id))

      expect(customerTickets.length).toBeGreaterThanOrEqual(2)
    })
  },
)
