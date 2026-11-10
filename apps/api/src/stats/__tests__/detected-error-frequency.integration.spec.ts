import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { queryFrequency } from '../frequency'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped detected-error-frequency integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, objects, tickets } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows
  if (!row) {
    throw new Error(`expected one ${what}`)
  }
  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'statistics frequency byDetectedError (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })
      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
        key,
      ).id
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('admin-freq-detected@example.org')
      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
      ])

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })
      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    beforeEach(async () => {
      const object = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: 'OBJ-FREQ-1',
            name: 'Freq Testobjekt',
            qrToken: 'qr-freq-1',
          })
          .returning({ id: objects.id }),
        'object',
      )

      const now = new Date()
      now.setHours(0, 0, 0, 0)

      await db.insert(tickets).values([
        {
          objectId: object.id,
          ticketNo: 'ST-2026-9801',
          status: 'CLOSED',
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: now,
          receivedAt: now,
          deadlineAt: now,
          acknowledgedAt: now,
          detectedErrorKeys: ['verkabelung_defekt'],
        },
        {
          objectId: object.id,
          ticketNo: 'ST-2026-9802',
          status: 'CLOSED',
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: now,
          receivedAt: now,
          deadlineAt: now,
          acknowledgedAt: now,
          detectedErrorKeys: ['verkabelung_defekt', 'sensor_defekt'],
        },
        {
          objectId: object.id,
          ticketNo: 'ST-2026-9803',
          status: 'CLOSED',
          priority: 'normal',
          source: 'INTERNAL',
          reportedAt: now,
          receivedAt: now,
          deadlineAt: now,
          acknowledgedAt: now,
          detectedErrorKeys: [],
        },
      ])
    })

    afterEach(async () => {
      await db.delete(tickets)
      await db.delete(objects)
    })

    it('groups tickets by detected error key in frequency', async () => {
      const result = await queryFrequency(db, {
        from: '2026-01-01',
        to: '2026-12-31',
      })

      const byKey = Object.fromEntries(
        result.byDetectedError.map((entry) => [entry.key, entry.count]),
      )

      expect(byKey['verkabelung_defekt']).toBe(2)
      expect(byKey['sensor_defekt']).toBe(1)
    })

    it('returns empty byDetectedError when no keys are set', async () => {
      await db.delete(tickets)

      const object = onlyRow(
        await db
          .insert(objects)
          .values({
            objectNo: 'OBJ-FREQ-2',
            name: 'Freq Testobjekt 2',
            qrToken: 'qr-freq-2',
          })
          .returning({ id: objects.id }),
        'object',
      )

      const now = new Date()
      now.setHours(0, 0, 0, 0)

      await db.insert(tickets).values({
        objectId: object.id,
        ticketNo: 'ST-2026-9804',
        status: 'CLOSED',
        priority: 'normal',
        source: 'INTERNAL',
        reportedAt: now,
        receivedAt: now,
        deadlineAt: now,
        acknowledgedAt: now,
        detectedErrorKeys: [],
      })

      const result = await queryFrequency(db, {
        from: '2026-01-01',
        to: '2026-12-31',
      })

      expect(result.byDetectedError).toEqual([])
    })
  },
)
