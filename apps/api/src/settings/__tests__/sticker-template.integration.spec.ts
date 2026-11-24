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
  process.stderr.write(`skipped sticker template integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles } = schema

type TemplateResponseBody = {
  template?: {
    templateKey: string
    geometry: Record<string, number | string>
    appearance: Record<string, unknown>
  }
}
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'sticker template API — GET and PUT /api/v1/settings/sticker-template (integration)',
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

    function getTemplate(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/sticker-template',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putTemplate(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/sticker-template',
        headers: { cookie },
        payload,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-sticker@example.org')
      officeId = await userIdFor('office-sticker@example.org')

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
      const response = await getTemplate()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('answers 401 to an anonymous PUT', async () => {
      const response = await putTemplate('', { templateKey: 'a4-21' })

      expect(response.statusCode).toBe(401)
    })

    it('reads the template for a colleague with object.read and refuses the write', async () => {
      const get = await getTemplate(cookies['office'])
      const put = await putTemplate(cookies['office'], { templateKey: 'a4-21' })

      expect(get.statusCode).toBe(200)
      expect(put.statusCode).toBe(403)
      expect(put.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the default template before anything is configured', async () => {
      const response = await getTemplate(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<TemplateResponseBody>().template).toEqual({
        templateKey: 'a4-2x2',
        geometry: {
          page: 'a4',
          columns: 2,
          rows: 2,
          labelWidthMm: 105,
          labelHeightMm: 148,
          marginTopMm: 0,
          marginRightMm: 0,
          marginBottomMm: 0,
          marginLeftMm: 0,
          gapXMm: 0,
          gapYMm: 0,
        },
        appearance: {
          qrLevel: 'M',
          qrSizeMm: null,
          showName: true,
          showObjectNo: true,
          showCallText: true,
        },
      })
    })

    it('takes the geometry of a preset over and stores it', async () => {
      const put = await putTemplate(cookies['admin'], { templateKey: 'a4-21' })

      expect(put.statusCode).toBe(200)
      expect(put.json<TemplateResponseBody>().template?.templateKey).toBe('a4-21')
      expect(put.json<TemplateResponseBody>().template?.geometry).toEqual({
        page: 'a4',
        columns: 3,
        rows: 7,
        labelWidthMm: 63.5,
        labelHeightMm: 38.1,
        marginTopMm: 12,
        marginRightMm: 8,
        marginBottomMm: 12,
        marginLeftMm: 8,
        gapXMm: 1,
        gapYMm: 1,
      })

      const get = await getTemplate(cookies['admin'])

      expect(get.json<TemplateResponseBody>().template?.templateKey).toBe('a4-21')
    })

    it('keeps the stored geometry when only the appearance is written', async () => {
      const put = await putTemplate(cookies['admin'], {
        appearance: { qrLevel: 'H', qrSizeMm: 40, showCallText: false },
      })

      expect(put.statusCode).toBe(200)
      expect(put.json<TemplateResponseBody>().template?.geometry.columns).toBe(3)
      expect(put.json<TemplateResponseBody>().template?.appearance).toEqual({
        qrLevel: 'H',
        qrSizeMm: 40,
        showName: true,
        showObjectNo: true,
        showCallText: false,
      })
    })

    it('names the free grid when the geometry no longer matches a preset', async () => {
      const put = await putTemplate(cookies['admin'], {
        geometry: { rows: 6 },
      })

      expect(put.statusCode).toBe(200)
      expect(put.json<TemplateResponseBody>().template?.templateKey).toBe('custom')
      expect(put.json<TemplateResponseBody>().template?.geometry.rows).toBe(6)
    })

    it('refuses a geometry that does not fit on the sheet', async () => {
      const put = await putTemplate(cookies['admin'], {
        geometry: { columns: 8, rows: 7 },
      })

      expect(put.statusCode).toBe(400)
      expect(put.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['geometry.columns'] },
      })
    })

    it('refuses a malformed body with 400 invalid_request', async () => {
      const put = await putTemplate(cookies['admin'], { appearance: { qrLevel: 'X' } })

      expect(put.statusCode).toBe(400)
      expect(put.json<ErrorResponseBody>().code).toBe('invalid_request')
    })
  },
)
