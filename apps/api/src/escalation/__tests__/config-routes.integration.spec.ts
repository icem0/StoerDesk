import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation config integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

type ConfigBody = {
  stages: { key: string; names: Record<string, string>; position: number; active: boolean }[]
  rules: {
    key: string
    stageKey: string | null
    reference: string | null
    minutes: Record<string, number> | null
    percent: number | null
    condition: unknown
    actions: { key: string; type: string }[]
    active: boolean
  }[]
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the escalation configuration API — GET and PUT (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key)
        .id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getConfig(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/escalation/config',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putConfig(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/config',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function putStages(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/stages',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await seedEscalation(db)

      const adminId = await userIdFor('admin-escalation@example.org')
      const officeId = await userIdFor('office-escalation@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)

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

    it('answers 401 to an anonymous read and write', async () => {
      expect((await getConfig()).statusCode).toBe(401)
      expect((await putConfig('session=invalid', { rules: [] })).statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      expect((await getConfig(cookies['office'])).statusCode).toBe(200)
      expect((await putConfig(cookies['office'], { rules: [] })).statusCode).toBe(403)
    })

    it('answers the five stages and the rules of the seed', async () => {
      const response = await getConfig(cookies['admin'])

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.stages.map((stage) => stage.key)).toEqual([
        'review',
        'work_order',
        'assignment',
        'acceptance',
        'acknowledgement',
      ])
      expect(body.rules.map((rule) => rule.key)).toContain('deadline_exceeded')
    })

    it('replaces the rules and their actions', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 20, normal: 20, high: 20, critical: 8 },
            percent: null,
            condition: { all: [{ field: 'priority', operator: 'in', value: ['high', 'critical'] }] },
            actions: [
              {
                key: 'office_webhook',
                type: 'webhook',
                endpointIds: ['11111111-1111-4111-8111-111111111111'],
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.rules).toHaveLength(1)
      expect(body.rules[0]?.actions[0]?.type).toBe('webhook')
      expect(body.rules[0]?.minutes).toEqual({ low: 20, normal: 20, high: 20, critical: 8 })
    })

    it('rejects a rule of an unknown stage and a malformed body', async () => {
      const unknownStage = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'broken',
            stageKey: 'office',
            reference: 'received_at',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(unknownStage.statusCode).toBe(400)
      expect(unknownStage.json<ErrorResponseBody>().code).toBe('invalid_request')

      const malformed = await putConfig(cookies['admin'], { rules: [{ key: 'no-clock' }] })

      expect(malformed.statusCode).toBe(400)
      expect(malformed.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('replaces the names of the stages and keeps their keys', async () => {
      const response = await putStages(cookies['admin'], {
        stages: [
          { key: 'review', names: { de: 'Prüfung des Büros', en: 'Office review' }, position: 1, active: true },
          { key: 'work_order', names: { de: 'Auftrag angelegt', en: 'Work order created' }, position: 2, active: true },
          { key: 'assignment', names: { de: 'Zuweisen oder Anbieten', en: 'Assign or offer' }, position: 3, active: true },
          { key: 'acceptance', names: { de: 'Angenommen', en: 'Accepted' }, position: 4, active: true },
          { key: 'acknowledgement', names: { de: 'Quittiert', en: 'Acknowledged' }, position: 5, active: true },
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.stages[0]?.names.de).toBe('Prüfung des Büros')
    })

    it('rejects a stage body with an unknown key', async () => {
      const response = await putStages(cookies['admin'], {
        stages: [{ key: 'office', names: { de: 'Büro', en: 'Office' }, position: 1, active: true }],
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>().code).toBe('invalid_request')
    })
  },
)
