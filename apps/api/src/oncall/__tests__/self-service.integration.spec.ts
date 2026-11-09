import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { oncallPools, groups, users } from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call self-service read routes: ${testDatabase.reason}\n`)
}

const { roles, userGroups, userRoles } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('on-call self-service read routes (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let techId = ''
  let groupId = ''
  let poolId = ''
  let techCookie = ''
  let reporterCookie = ''

  async function userIdFor(email: string): Promise<string> {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash: 'no-login-for-self-service-user' })
      .returning({ id: users.id })

    return onlyRow(inserted, `user ${email}`).id
  }

  async function roleIdFor(key: string): Promise<string> {
    return onlyRow(
      await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
      key,
    ).id
  }

  async function grantRole(userId: string, roleKey: string): Promise<void> {
    await db.insert(userRoles).values({ userId, roleId: await roleIdFor(roleKey) })
  }

  async function grantGroup(userId: string, groupId: string): Promise<void> {
    await db.insert(userGroups).values({ userId, groupId })
  }

  async function sessionCookieFor(userId: string): Promise<string> {
    const session = await createSession(db, userId, 1)
    return `session=${session.token}`
  }

  function icalUrl(cookie: string) {
    return app.inject({
      method: 'GET',
      url: '/api/v1/oncall/ical-url',
      headers: { cookie },
    })
  }

  function poolMembers(cookie: string, poolId: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/oncall/pools/${poolId}/members`,
      headers: { cookie },
    })
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    techId = await userIdFor('tech-self-service@example.org')
    const reporterId = await userIdFor('reporter-self-service@example.org')

    poolId = onlyRow(
      await db.insert(oncallPools).values({ name: 'Bereitschaft, Nord' }).returning({ id: oncallPools.id }),
      'pool',
    ).id

    groupId = onlyRow(
      await db.insert(groups).values({ name: 'Bereitschaftsgruppe Nord' }).returning({ id: groups.id }),
      'group',
    ).id

    await db.update(oncallPools).set({ groupId }).where(eq(oncallPools.id, poolId))

    await grantRole(techId, 'oncall')
    await grantGroup(techId, groupId)
    await grantRole(reporterId, 'reporter_internal')

    techCookie = await sessionCookieFor(techId)
    reporterCookie = await sessionCookieFor(reporterId)

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

  it('answers the iCal URL of the signed-in user', async () => {
    const response = await icalUrl(techCookie)
    expect(response.statusCode).toBe(200)

    const body = response.json<{ url?: string }>()
    expect(body.url).toMatch(/^\/api\/v1\/oncall\/ical\/[^/]+\.ics$/)
  })

  it('lists the pool members of a pool', async () => {
    const response = await poolMembers(techCookie, poolId)
    expect(response.statusCode).toBe(200)

    const body = response.json<{ members?: Array<{ id: string; email: string }> }>()
    expect(body.members?.some((member) => member.id === techId)).toBe(true)
  })

  it('refuses unknown pools with 404', async () => {
    const response = await poolMembers(techCookie, '00000000-0000-0000-0000-000000000000')
    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorResponseBody>()).toEqual({
      code: 'oncall_pool_not_found',
      params: { fields: ['id'] },
    })
  })

  it('refuses users without oncall.read with 403', async () => {
    const response = await icalUrl(reporterCookie)
    expect(response.statusCode).toBe(403)
  })
})
