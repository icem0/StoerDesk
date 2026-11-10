import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CSV_IMPORT_MAX_ROWS } from '@stoerdesk/shared'
import * as schema from '../../db/schema'
import { createSession } from '../../auth/session'
import { seedRbac } from '../../db/seed-rbac'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped csv import routes: ${testDatabase.reason}\n`)
}

const { objects, roles, userRoles, users } = schema

const csv = [
  'objektnummer;bezeichnung;ort',
  'IMP-101;Pump house;Berlin',
  'IMP-102;Depot two;Cologne',
  'IMP-103;;Cologne',
].join('\r\n')

type RowBody = {
  line: number
  objectNo: string
  action: string
  errors: Array<{ code: string; params: unknown }>
}
type PreviewBody = { rows: RowBody[]; summary: Record<string, number> }
type CommitBody = PreviewBody & { applied: Record<string, number> }
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'CSV import routes — preview, commit, permission and idempotency (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'office' | 'reporter', string> = { office: '', reporter: '' }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-import-test' })
        .returning({ id: users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
        `role ${key}`,
      ).id
    }

    async function sessionCookieFor(email: string, roleKey: string): Promise<string> {
      const userId = await userIdFor(email)

      await db.insert(userRoles).values({
        userId,
        roleId: await roleIdFor(roleKey),
      })

      return `session=${(await createSession(db, userId, 1)).token}`
    }

    function call(cookie: string | undefined, path: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/objects/${path}`,
        headers: cookie === undefined ? {} : { cookie },
        payload,
      })
    }

    const stored = async (objectNo: string) => {
      const [row] = await db.select().from(objects).where(eq(objects.objectNo, objectNo))

      return row
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      cookies['office'] = await sessionCookieFor('import-office@example.org', 'office')
      cookies['reporter'] = await sessionCookieFor('import-reporter@example.org', 'reporter_internal')

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

    it('answers 401 without a session and 403 without object.import', async () => {
      const anonymous = await call(undefined, 'import/preview', { csv })
      const denied = await call(cookies['reporter'], 'import', { csv })

      expect(anonymous.statusCode).toBe(401)
      expect(anonymous.json<ErrorBody>().code).toBe('session_invalid')
      expect(denied.statusCode).toBe(403)
      expect(denied.json<ErrorBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('previews the rows of the file and writes nothing', async () => {
      await db
        .insert(objects)
        .values({ objectNo: 'IMP-101', name: 'Pump house', city: 'Berlin', notes: 'local note' })

      const response = await call(cookies['office'], 'import/preview', { csv })

      expect(response.statusCode).toBe(200)

      const preview = response.json<PreviewBody>()

      expect(preview.summary).toEqual({ new: 1, changed: 0, unchanged: 1, error: 1 })
      expect(preview.rows.map((row) => row.action)).toEqual(['unchanged', 'new', 'error'])
      expect(preview.rows.map((row) => row.line)).toEqual([2, 3, 4])
      expect(preview.rows[2]?.objectNo).toBe('IMP-103')
      expect(preview.rows[2]?.errors[0]?.params).toEqual({ fields: ['name'] })

      expect(await stored('IMP-101')).toMatchObject({
        name: 'Pump house',
        notes: 'local note',
        qrToken: null,
      })
      expect(await stored('IMP-102')).toBeUndefined()
    })

    it('commits the valid rows and keeps the row error out of the way', async () => {
      const response = await call(cookies['office'], 'import', { csv })

      expect(response.statusCode).toBe(200)

      const result = response.json<CommitBody>()

      expect(result.applied).toEqual({ created: 1, updated: 0, unchanged: 1, failed: 1 })
      expect(result.rows.map((row) => row.action)).toEqual(['unchanged', 'new', 'error'])

      const created = await stored('IMP-102')

      expect(created).toMatchObject({ name: 'Depot two', city: 'Cologne', notes: null })
      expect(created?.qrToken ?? '').toMatch(/^[A-Za-z0-9_-]{22}$/)
      expect((await stored('IMP-101'))?.qrToken).toBeNull()
    })

    it('writes nothing for a repeated identical import', async () => {
      const createdBefore = await stored('IMP-102')

      const response = await call(cookies['office'], 'import', { csv })

      expect(response.statusCode).toBe(200)
      expect(response.json<CommitBody>().applied).toEqual({
        created: 0,
        updated: 0,
        unchanged: 2,
        failed: 1,
      })
      expect((await stored('IMP-102'))?.updatedAt?.getTime()).toBe(
        createdBefore?.updatedAt?.getTime(),
      )
    })

    it('rejects a missing csv, an unknown mapping target and an invalid document', async () => {
      const noCsv = await call(cookies['office'], 'import/preview', { mapping: {} })

      expect(noCsv.statusCode).toBe(400)
      expect(noCsv.json<ErrorBody>().params?.fields).toEqual(['csv'])

      const unknownTarget = await call(
        cookies['office'],
        'import/preview',
        { csv, mapping: { bezeichnung: 'qrToken' } },
      )

      expect(unknownTarget.statusCode).toBe(400)
      expect(unknownTarget.json<ErrorBody>().code).toBe('invalid_request')
      expect(unknownTarget.json<ErrorBody>().params?.fields).toEqual(['mapping.bezeichnung'])

      const duplicateHeader = await call(
        cookies['office'],
        'import/preview',
        { csv: 'objektnummer;bezeichnung;bezeichnung\nA-9;B;C' },
      )

      expect(duplicateHeader.statusCode).toBe(400)
      expect(duplicateHeader.json<ErrorBody>().params?.fields).toEqual(['csv'])

      const tooManyRows = await call(
        cookies['office'],
        'import/preview',
        { csv: `objectNo;name\n${'A-9;x\n'.repeat(CSV_IMPORT_MAX_ROWS + 1)}` },
      )

      expect(tooManyRows.statusCode).toBe(400)
      expect(tooManyRows.json<ErrorBody>().params?.fields).toEqual(['csv'])
    })
  },
)
