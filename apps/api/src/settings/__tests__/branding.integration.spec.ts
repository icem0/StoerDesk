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
  process.stderr.write(`skipped branding settings integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles } = schema

type BrandingResponseBody = { companyName?: string; titleEnabled?: boolean; logo: string }
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'branding settings API — GET and PUT /api/v1/settings/branding (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let adminId = ''
    let officeId = ''
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

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

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getBranding(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/branding',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putBranding(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/branding',
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-branding@example.org')
      officeId = await userIdFor('office-branding@example.org')

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

    it('answers 401 to an anonymous GET', async () => {
      const response = await getBranding()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('answers 401 to an anonymous PUT', async () => {
      const response = await putBranding('', { companyName: 'Beispiel GmbH' })

      expect(response.statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      const get = await getBranding(cookies['office'])
      const put = await putBranding(cookies['office'], { companyName: 'Beispiel GmbH' })

      expect(get.statusCode).toBe(200)
      expect(put.statusCode).toBe(403)
      expect(put.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the empty company name before anything is configured', async () => {
      const response = await getBranding(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<BrandingResponseBody>()).toEqual({ companyName: '', titleEnabled: false, logo: '' })
    })

    it('stores and returns the company name', async () => {
      const put = await putBranding(cookies['admin'], { companyName: 'Beispiel GmbH' })

      expect(put.statusCode).toBe(200)
      expect(put.json<BrandingResponseBody>()).toEqual({ companyName: 'Beispiel GmbH', titleEnabled: false, logo: '' })

      const get = await getBranding(cookies['admin'])

      expect(get.statusCode).toBe(200)
      expect(get.json<BrandingResponseBody>()).toEqual({ companyName: 'Beispiel GmbH', titleEnabled: false, logo: '' })
    })

    it('resets to the empty name', async () => {
      await putBranding(cookies['admin'], { companyName: '' })

      const response = await getBranding(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<BrandingResponseBody>()).toEqual({ companyName: '', titleEnabled: false, logo: '' })
    })

    it('rejects a too long name with 400 invalid_request', async () => {
      const response = await putBranding(cookies['admin'], {
        companyName: 'a'.repeat(201),
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['companyName'] },
      })
    })

    it('rejects a missing name with 400 invalid_request', async () => {
      const response = await putBranding(cookies['admin'], {})

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['companyName'] },
      })
    })

    it('answers titleEnabled false before anything is configured', async () => {
      const response = await getBranding(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<BrandingResponseBody>()).toEqual({ companyName: '', titleEnabled: false, logo: '' })
    })

    it('stores and returns titleEnabled true', async () => {
      const put = await putBranding(cookies['admin'], { companyName: 'Beispiel GmbH', titleEnabled: true })

      expect(put.statusCode).toBe(200)
      expect(put.json<BrandingResponseBody>()).toEqual({ companyName: 'Beispiel GmbH', titleEnabled: true, logo: '' })

      const get = await getBranding(cookies['admin'])

      expect(get.statusCode).toBe(200)
      expect(get.json<BrandingResponseBody>()).toEqual({ companyName: 'Beispiel GmbH', titleEnabled: true, logo: '' })
    })

    it('resets titleEnabled to false', async () => {
      await putBranding(cookies['admin'], { companyName: 'Beispiel GmbH', titleEnabled: false })

      const response = await getBranding(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<BrandingResponseBody>()).toEqual({ companyName: 'Beispiel GmbH', titleEnabled: false, logo: '' })
    })

    it('rejects a logo whose bytes do not match the claim', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00])
      const response = await putBranding(
        cookies['admin'],
        { companyName: 'Beispiel GmbH', logo: `data:image/png;base64,${jpeg.toString('base64')}` },
      )

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'invalid_request', params: { fields: ['logo'] } })
    })
  },
)
