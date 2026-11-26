import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped customer portal switch integration: ${testDatabase.reason}\n`)
}

const { notificationChannels, roles, settings, userRoles, users } = schema

type PortalAnswer = {
  portalEnabled: boolean
  registrationEnabled: boolean
  mailReady: boolean
  mailReasons: string[]
}
type ErrorBody = { code?: string }

describe.skipIf(testDatabase.status === 'unavailable')(
  'the switch of the customer portal (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminCookie = ''
    let customerCookie = ''
    let customerId = ''

    async function switchPortal(portalEnabled: boolean, registrationEnabled: boolean) {
      const answer = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings/customers',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        payload: { portalEnabled, registrationEnabled },
      })

      return answer
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const [admin] = await db
        .insert(users)
        .values({ email: 'switch-admin@example.org', passwordHash: 'not-used' })
        .returning({ id: users.id })

      const [customer] = await db
        .insert(users)
        .values({ email: 'switch-customer@example.org', passwordHash: 'not-used' })
        .returning({ id: users.id })

      customerId = customer!.id

      const [adminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'admin'))
      const [customerRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'customer'))

      await db.insert(userRoles).values([
        { userId: admin!.id, roleId: adminRole!.id },
        { userId: customerId, roleId: customerRole!.id },
      ])

      adminCookie = `session=${(await createSession(db, admin!.id, 1)).token}`
      customerCookie = `session=${(await createSession(db, customerId, 1)).token}`
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('has both switches off by default', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/customers',
        headers: { cookie: adminCookie },
      })

      expect(answer.statusCode).toBe(200)

      const body = answer.json() as PortalAnswer

      expect(body.portalEnabled).toBe(false)
      expect(body.registrationEnabled).toBe(false)
    })

    it('refuses the registration while the mailbox is not cleanly set up', async () => {
      const answer = await switchPortal(true, true)

      expect(answer.statusCode).toBe(422)
      expect((answer.json() as ErrorBody).code).toBe('mail_not_ready')
    })

    it('names the reasons why the mailbox is not ready', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/customers',
        headers: { cookie: adminCookie },
      })

      const body = answer.json() as PortalAnswer

      expect(body.mailReady).toBe(false)
      expect(body.mailReasons.length).toBeGreaterThan(0)
    })

    it('switches the portal on and lets the customer into his portal', async () => {
      expect((await switchPortal(true, false)).statusCode).toBe(200)

      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(200)
    })

    it('keeps the customer out of the portal while the switch is off', async () => {
      expect((await switchPortal(false, false)).statusCode).toBe(200)

      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/tickets',
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(403)
      expect((answer.json() as ErrorBody).code).toBe('customer_portal_disabled')
    })

    it('refuses the sign in of a customer while the portal is off', async () => {
      const answer = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'switch-customer@example.org', password: 'not-used' },
      })

      // The password is wrong, so the login stays a 401 — the switch is only
      // asked after the password was verified.
      expect(answer.statusCode).toBe(401)
    })

    it('offers the registration only with a cleanly set up mailbox', async () => {
      await db
        .insert(notificationChannels)
        .values({
          name: 'E-Mail',
          kind: 'email',
          enabled: true,
          label: 'SMTP',
          config: { host: '127.0.0.1', port: '1', from: 'stoerdesk@example.org' },
        })
        .onConflictDoNothing()

      const answer = await app.inject({
        method: 'GET',
        url: '/api/v1/public/auth/registration',
      })

      expect(answer.statusCode).toBe(200)
      expect((answer.json() as { available: boolean }).available).toBe(false)
    })

    it('switches the registration on with a cleanly set up mailbox', async () => {
      const answer = await switchPortal(true, true)

      expect(answer.statusCode).toBe(200)

      const availability = await app.inject({
        method: 'GET',
        url: '/api/v1/public/auth/registration',
      })

      expect((availability.json() as { available: boolean }).available).toBe(true)
    })

    it('keeps the switch in the settings of the instance', async () => {
      const rows = await db.select().from(settings)

      expect(rows.map((row) => row.key)).toContain('customer.portal_enabled')
      expect(rows.map((row) => row.key)).toContain('customer.registration_enabled')
    })
  },
)
