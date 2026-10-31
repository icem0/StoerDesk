import { and, eq } from 'drizzle-orm'
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
  process.stderr.write(`skipped objects integration: ${testDatabase.reason}\n`)
}

const { objects, roles, systems, userRoles, users } = schema

type SystemBody = { id: string; type: string; label: string }
type ObjectBody = {
  id: string
  objectNo: string
  name: string
  city: string | null
  active: boolean
  systems: SystemBody[]
}
type ListBody = { objects?: ObjectBody[] }
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'objects API — object list CRUD (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    const cookies: Record<'admin' | 'office' | 'reporter', string> = {
      admin: '',
      office: '',
      reporter: '',
    }

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(users)
        .values({ email, passwordHash: 'no-login-for-this-object-test' })
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

    function getObjects(cookie?: string, query = '') {
      return app.inject({
        method: 'GET',
        url: `/api/v1/objects${query}`,
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function getObject(cookie: string, objectNo: string) {
      return app.inject({ method: 'GET', url: `/api/v1/objects/${objectNo}`, headers: { cookie } })
    }

    function postObject(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/objects',
        headers: { cookie },
        payload,
      })
    }

    function patchObject(cookie: string, objectNo: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/objects/${objectNo}`,
        headers: { cookie },
        payload,
      })
    }

    function deleteObject(cookie: string, objectNo: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/objects/${objectNo}`,
        headers: { cookie },
      })
    }

    async function createAsAdmin(objectNo: string, values: Record<string, unknown> = {}) {
      const response = await postObject(cookies['admin'], {
        objectNo,
        name: `Objekt ${objectNo}`,
        systems: [{ type: 'BMA', label: 'BMA' }],
        ...values,
      })

      expect(response.statusCode).toBe(201)

      return response.json<ObjectBody>()
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      const adminId = await userIdFor('objects-admin@example.org')
      const officeId = await userIdFor('objects-office@example.org')
      const reporterId = await userIdFor('objects-reporter@example.org')

      await db.insert(userRoles).values([
        { userId: adminId, roleId: await roleIdFor('admin') },
        { userId: officeId, roleId: await roleIdFor('office') },
        { userId: reporterId, roleId: await roleIdFor('reporter_internal') },
      ])

      cookies['admin'] = await sessionCookieFor(adminId)
      cookies['office'] = await sessionCookieFor(officeId)
      cookies['reporter'] = await sessionCookieFor(reporterId)

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

    it('answers 401 before any permission check for an anonymous request', async () => {
      const list = await getObjects()
      const create = await postObject('session=missing', {
        objectNo: 'ANON_01',
        name: 'Anonymous',
      })

      expect(list.statusCode).toBe(401)
      expect(list.json<ErrorBody>().code).toBe('session_invalid')
      expect(create.statusCode).toBe(401)
      expect(create.json<ErrorBody>().code).toBe('session_invalid')
    })

    it('enforces object.read, object.write and object.delete', async () => {
      const readable = await getObjects(cookies['reporter'])
      const deniedCreate = await postObject(cookies['reporter'], {
        objectNo: 'DENY_01',
        name: 'Nicht erlaubt',
      })

      expect(readable.statusCode).toBe(200)
      expect(deniedCreate.statusCode).toBe(403)
      expect(deniedCreate.json<ErrorBody>()).toEqual({ code: 'forbidden', params: {} })

      const created = await createAsAdmin('PERM_01')
      const update = await patchObject(cookies['office'], 'PERM_01', { name: 'Office edit' })
      const deniedDelete = await deleteObject(cookies['office'], 'PERM_01')

      expect(created.objectNo).toBe('PERM_01')
      expect(update.statusCode).toBe(200)
      expect(deniedDelete.statusCode).toBe(403)
      expect(deniedDelete.json<ErrorBody>().code).toBe('forbidden')
    })

    it('creates, reads and updates an object with its systems', async () => {
      const created = await createAsAdmin('5001_01', {
        name: 'Werk Nord',
        street: 'Hauptstraße',
        houseNumber: '7',
        postalCode: '12345',
        city: 'Musterstadt',
        contactEmail: 'hausmeister@example.org',
        systems: [
          { type: 'BMA', label: 'BMA EG' },
          { type: 'RWA', label: 'RWA Treppe' },
        ],
      })

      expect(created).toMatchObject({
        objectNo: '5001_01',
        name: 'Werk Nord',
        city: 'Musterstadt',
        active: true,
      })
      expect(created.systems).toHaveLength(2)

      const bma = created.systems.find((system) => system.type === 'BMA')
      const rwa = created.systems.find((system) => system.type === 'RWA')

      expect(bma).toBeDefined()
      expect(rwa).toBeDefined()

      const detail = await getObject(cookies['reporter'], '5001_01')

      expect(detail.statusCode).toBe(200)
      expect(detail.json<ObjectBody>().id).toBe(created.id)

      const updated = await patchObject(cookies['admin'], '5001_01', {
        name: 'Werk Nord 2',
        contactPhone: '0123 456789',
        systems: [
          { id: bma?.id, type: 'BMA', label: 'BMA EG neu' },
          { type: 'EMA', label: 'EMA Lager' },
        ],
      })
      const body = updated.json<ObjectBody>()

      expect(updated.statusCode).toBe(200)
      expect(body.name).toBe('Werk Nord 2')
      expect(body.systems).toHaveLength(2)
      expect(body.systems.map((system) => system.type).sort()).toEqual(['BMA', 'EMA'])
      expect(body.systems.find((system) => system.type === 'BMA')?.id).toBe(bma?.id)
      expect(body.systems.some((system) => system.id === rwa?.id)).toBe(false)

      const noop = await patchObject(cookies['admin'], '5001_01', {})

      expect(noop.statusCode).toBe(200)
      expect(noop.json<ObjectBody>().name).toBe('Werk Nord 2')
    })

    it('rejects a duplicate object number case-insensitively', async () => {
      await createAsAdmin('DUP_01')

      const duplicate = await postObject(cookies['admin'], {
        objectNo: 'dup_01',
        name: 'Doppelt',
      })
      const invalid = await postObject(cookies['admin'], { objectNo: 'bad number', name: '' })

      expect(duplicate.statusCode).toBe(422)
      expect(duplicate.json<ErrorBody>()).toEqual({
        code: 'object_no_taken',
        params: { fields: ['objectNo'] },
      })
      expect(invalid.statusCode).toBe(400)
      expect(invalid.json<ErrorBody>().code).toBe('invalid_request')
      expect(invalid.json<ErrorBody>().params?.fields).toEqual(
        expect.arrayContaining(['objectNo', 'name']),
      )
    })

    it('filters the list by search, city, active state and system type', async () => {
      await createAsAdmin('6001_01', {
        name: 'Alpha Haus',
        city: 'Musterstadt',
        systems: [{ type: 'BMA', label: 'BMA' }],
      })
      await createAsAdmin('6002_01', {
        name: 'Beta Halle',
        city: 'Beispielstadt',
        systems: [{ type: 'RWA', label: 'RWA' }],
      })
      await createAsAdmin('6003_01', {
        name: 'Gamma Werk',
        city: 'Beispielstadt',
        systems: [
          { type: 'BMA', label: 'BMA' },
          { type: 'RWA', label: 'RWA' },
        ],
      })

      const byName = await getObjects(cookies['admin'], '?search=Beta')
      const byNumber = await getObjects(cookies['admin'], '?search=6003')
      const byCity = await getObjects(cookies['admin'], '?city=beispielstadt')
      const byBma = await getObjects(cookies['admin'], '?search=600&systemType=BMA')
      const combined = await getObjects(
        cookies['admin'],
        '?city=Beispielstadt&systemType=BMA',
      )
      const invalid = await getObjects(cookies['admin'], '?systemType=NOPE')

      expect(byName.json<ListBody>().objects?.map((object) => object.objectNo)).toEqual([
        '6002_01',
      ])
      expect(byNumber.json<ListBody>().objects?.map((object) => object.objectNo)).toEqual([
        '6003_01',
      ])
      expect(byCity.json<ListBody>().objects?.map((object) => object.objectNo).sort()).toEqual([
        '6002_01',
        '6003_01',
      ])
      expect(byBma.json<ListBody>().objects?.map((object) => object.objectNo).sort()).toEqual([
        '6001_01',
        '6003_01',
      ])
      expect(combined.json<ListBody>().objects?.map((object) => object.objectNo)).toEqual([
        '6003_01',
      ])
      expect(invalid.statusCode).toBe(400)
      expect(invalid.json<ErrorBody>().params?.fields).toEqual(['systemType'])
    })

    it('soft-deletes an object and keeps it visible only on request', async () => {
      const created = await createAsAdmin('7001_01')

      const removed = await deleteObject(cookies['admin'], '7001_01')

      expect(removed.statusCode).toBe(204)

      const [stored] = await db
        .select({ active: objects.active })
        .from(objects)
        .where(eq(objects.id, created.id))

      expect(stored?.active).toBe(false)

      const [systemCount] = await db
        .select({ id: systems.id })
        .from(systems)
        .where(and(eq(systems.objectId, created.id), eq(systems.type, 'BMA')))

      expect(systemCount).toBeDefined()

      const defaultList = await getObjects(cookies['admin'], '?search=7001')
      const allList = await getObjects(cookies['admin'], '?search=7001&active=all')
      const inactiveList = await getObjects(cookies['admin'], '?search=7001&active=false')
      const detail = await getObject(cookies['admin'], '7001_01')
      const deletedAgain = await deleteObject(cookies['admin'], '7001_01')
      const unknown = await deleteObject(cookies['admin'], '9999_99')

      expect(defaultList.json<ListBody>().objects).toEqual([])
      expect(allList.json<ListBody>().objects).toHaveLength(1)
      expect(allList.json<ListBody>().objects?.[0]?.active).toBe(false)
      expect(inactiveList.json<ListBody>().objects).toHaveLength(1)
      expect(detail.statusCode).toBe(200)
      expect(detail.json<ObjectBody>().active).toBe(false)
      expect(deletedAgain.statusCode).toBe(204)
      expect(unknown.statusCode).toBe(404)
      expect(unknown.json<ErrorBody>().code).toBe('object_not_found')
    })
  },
)
