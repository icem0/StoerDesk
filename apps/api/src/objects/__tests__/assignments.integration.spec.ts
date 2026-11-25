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
  process.stderr.write(`skipped assignments integration: ${testDatabase.reason}\n`)
}

const { objects, roles, userRoles, users } = schema

type AssignmentBody = {
  userId: string
  givenName: string
  familyName: string
  createdAt: string
}
type AssignmentsAnswer = { assignments?: AssignmentBody[] }
type ErrorBody = { code?: string }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the trained people of an object (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminCookie = ''
    let customerCookie = ''
    let customerId = ''
    let objectNo = ''

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function userWithRole(email: string, roleKey: string): Promise<string> {
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-assignment-test' })
        .returning({ id: users.id })

      const id = onlyRow(user ? [user] : [], `user ${email}`).id

      await db.insert(userRoles).values({ userId: id, roleId: await roleIdFor(roleKey) })

      return id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const adminId = await userWithRole('assign-admin@example.org', 'admin')
      customerId = await userWithRole('assign-customer@example.org', 'customer')

      const adminSession = await createSession(db, adminId, 1)
      const customerSession = await createSession(db, customerId, 1)

      adminCookie = `session=${adminSession.token}`
      customerCookie = `session=${customerSession.token}`

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `A${Date.now().toString().slice(-6)}`, name: 'Melder EG' })
        .returning({ objectNo: objects.objectNo })

      objectNo = onlyRow(object ? [object] : [], 'object').objectNo
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('lets the administration assign a customer and removes the assignment again', async () => {
      const added = await app.inject({
        method: 'POST',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        payload: { userId: customerId },
      })

      expect(added.statusCode).toBe(201)

      const listed = await app.inject({
        method: 'GET',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: adminCookie },
      })

      expect(listed.statusCode).toBe(200)

      const answer = listed.json() as AssignmentsAnswer

      expect(answer.assignments?.map((entry) => entry.userId)).toContain(customerId)

      const removed = await app.inject({
        method: 'DELETE',
        url: `/api/v1/objects/${objectNo}/assignments/${customerId}`,
        headers: { cookie: adminCookie },
      })

      expect(removed.statusCode).toBe(204)
    })

    it('refuses the second assignment of the same customer', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        payload: { userId: customerId },
      })

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        payload: { userId: customerId },
      })

      expect(second.statusCode).toBe(409)
      expect((second.json() as ErrorBody).code).toBe('object_assignee_exists')
    })

    it('refuses a user that is no customer', async () => {
      const strangerId = await userWithRole('assign-stranger@example.org', 'office')

      const answer = await app.inject({
        method: 'POST',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        payload: { userId: strangerId },
      })

      expect(answer.statusCode).toBe(404)
      expect((answer.json() as ErrorBody).code).toBe('customer_not_found')
    })

    it('keeps the assignment away from the customer himself', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: `/api/v1/objects/${objectNo}/assignments`,
        headers: { cookie: customerCookie },
      })

      expect(answer.statusCode).toBe(403)
      expect((answer.json() as ErrorBody).code).toBe('forbidden')
    })
  },
)
