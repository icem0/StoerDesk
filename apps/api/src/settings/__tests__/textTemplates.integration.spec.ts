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
  process.stderr.write(`skipped text template integration: ${testDatabase.reason}\n`)
}

const { objects, roles, tickets, userRoles, users } = schema

type TemplateSummary = {
  id: string
  key: string
  archivedAt: string | null
  translations: { de: string; en: string }
  usageCount: number
}

type TemplateListBody = { templates?: TemplateSummary[] }
type PublicListBody = { templates?: { key: string; text: string }[] }
type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'text template catalog API — admin CRUD, archive and public catalog (integration)',
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
        .values({ email, passwordHash: 'no-login-for-this-text-template-user' })
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

    function listTemplates(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/text-templates',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function createTemplate(cookie: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/text-templates',
        headers: { cookie },
        payload,
      })
    }

    function patchTemplate(cookie: string, id: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'PATCH',
        url: `/api/v1/text-templates/${id}`,
        headers: { cookie },
        payload,
      })
    }

    function deleteTemplate(cookie: string, id: string) {
      return app.inject({
        method: 'DELETE',
        url: `/api/v1/text-templates/${id}`,
        headers: { cookie },
      })
    }

    function publicTemplates(locale = 'de') {
      return app.inject({
        method: 'GET',
        url: `/api/v1/public/text-templates?locale=${locale}`,
      })
    }

    async function createForTest(de: string, en: string): Promise<TemplateSummary> {
      const response = await createTemplate(cookies['admin'], {
        translations: { de, en },
      })

      expect(response.statusCode).toBe(201)

      return response.json<TemplateSummary>()
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)

      adminId = await userIdFor('admin-text-templates@example.org')
      officeId = await userIdFor('office-text-templates@example.org')

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

    it('answers 401 to an anonymous catalog request', async () => {
      const response = await listTemplates()

      expect(response.statusCode).toBe(401)
      expect(response.json<ErrorResponseBody>().code).toBe('session_invalid')
    })

    it('lets office read but not write the catalog', async () => {
      const list = await listTemplates(cookies['office'])
      const create = await createTemplate(cookies['office'], {
        translations: { de: 'Test', en: 'Test' },
      })

      expect(list.statusCode).toBe(200)
      expect(list.json<TemplateListBody>().templates).toEqual([])
      expect(create.statusCode).toBe(403)
      expect(create.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('creates a template with a generated key and both translations', async () => {
      const created = await createForTest('Störung Test', 'Test fault')

      expect(created.key).toMatch(/^custom\.[a-z0-9]{32}$/)
      expect(created.archivedAt).toBeNull()
      expect(created.translations).toEqual({ de: 'Störung Test', en: 'Test fault' })
      expect(created.usageCount).toBe(0)
    })

    it('creates a template with a provided key', async () => {
      const response = await createTemplate(cookies['admin'], {
        key: 'feueralarm_ausloesung',
        translations: { de: 'Feueralarm ausgelöst', en: 'Fire alarm triggered' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json<TemplateSummary>()
      expect(body.key).toBe('feueralarm_ausloesung')
      expect(body.translations).toEqual({ de: 'Feueralarm ausgelöst', en: 'Fire alarm triggered' })
    })

    it('rejects a duplicate key with text_template_key_taken', async () => {
      const first = await createForTest('Erst', 'First')

      const duplicate = await createTemplate(cookies['admin'], {
        key: first.key,
        translations: { de: 'Zweit', en: 'Second' },
      })

      expect(duplicate.statusCode).toBe(409)
      expect(duplicate.json<ErrorResponseBody>()).toEqual({
        code: 'text_template_key_taken',
        params: { fields: ['key'] },
      })
    })

    it('offers active templates to the public catalog and hides archived ones', async () => {
      const created = await createForTest('Störung Archiv', 'Archive fault')

      const before = await publicTemplates('de')

      expect(before.statusCode).toBe(200)
      expect(before.json<PublicListBody>().templates).toContainEqual({
        key: created.key,
        text: 'Störung Archiv',
      })

      const archived = await patchTemplate(cookies['admin'], created.id, { archived: true })

      expect(archived.statusCode).toBe(200)
      expect(archived.json<TemplateSummary>().archivedAt).toEqual(expect.any(String))

      const after = await publicTemplates('de')

      expect(after.json<PublicListBody>().templates).not.toContainEqual({
        key: created.key,
        text: 'Störung Archiv',
      })
      expect((await publicTemplates('en')).json<PublicListBody>().templates).not.toContainEqual({
        key: created.key,
        text: 'Archive fault',
      })
    })

    it('edits translations and unarchives a template', async () => {
      const created = await createForTest('Alt', 'Old')
      await patchTemplate(cookies['admin'], created.id, { archived: true })

      const response = await patchTemplate(cookies['admin'], created.id, {
        archived: false,
        translations: { de: 'Neu', en: 'New' },
      })
      const body = response.json<TemplateSummary>()

      expect(response.statusCode).toBe(200)
      expect(body.archivedAt).toBeNull()
      expect(body.translations).toEqual({ de: 'Neu', en: 'New' })
      expect((await publicTemplates('de')).json<PublicListBody>().templates).toContainEqual({
        key: created.key,
        text: 'Neu',
      })
    })

    it('deletes an unused template', async () => {
      const created = await createForTest('Löschen', 'Delete')

      const response = await deleteTemplate(cookies['admin'], created.id)

      expect(response.statusCode).toBe(204)
      expect((await listTemplates(cookies['admin'])).json<TemplateListBody>().templates).not.toContainEqual(
        expect.objectContaining({ id: created.id }),
      )
    })

    it('refuses to delete a template a ticket carries', async () => {
      const created = await createForTest('In Benutzung', 'In use')
      const object = onlyRow(
        await db
          .insert(objects)
          .values({ objectNo: 'TEXT-TEMPLATE-1', name: 'Test object' })
          .returning(),
        'object',
      )
      const now = new Date()

      await db.insert(tickets).values({
        objectId: object.id,
        faultTemplateKeys: [created.key],
        reportedAt: now,
        deadlineAt: new Date(now.getTime() + 60_000),
      })

      const list = (await listTemplates(cookies['admin'])).json<TemplateListBody>()
      const withUsage = onlyRow(
        (list.templates ?? []).filter((template) => template.id === created.id),
        'used template',
      )

      expect(withUsage.usageCount).toBe(1)

      const response = await deleteTemplate(cookies['admin'], created.id)

      expect(response.statusCode).toBe(409)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'text_template_in_use',
        params: { fields: ['id'], key: created.key, usageCount: 1 },
      })
    })

    it('orders the catalog by recent fault usage, most frequent first', async () => {
      const rareResponse = await createTemplate(cookies['admin'], {
        key: 'a_rare',
        translations: { de: 'Rare fault', en: 'Rare fault' },
      })
      const frequentResponse = await createTemplate(cookies['admin'], {
        key: 'z_frequent',
        translations: { de: 'Frequent fault', en: 'Frequent fault' },
      })

      expect(rareResponse.statusCode).toBe(201)
      expect(frequentResponse.statusCode).toBe(201)

      const rareKey = rareResponse.json<TemplateSummary>().key
      const frequentKey = frequentResponse.json<TemplateSummary>().key

      const object = onlyRow(
        await db
          .insert(objects)
          .values({ objectNo: 'CATALOG-ORDER-1', name: 'Catalog order object' })
          .returning(),
        'object',
      )
      const now = new Date()

      const report = async (key: string) => {
        await db.insert(tickets).values({
          objectId: object.id,
          faultTemplateKeys: [key],
          reportedAt: now,
          deadlineAt: new Date(now.getTime() + 60_000),
        })
      }

      await report(frequentKey)
      await report(frequentKey)
      await report(rareKey)

      const publicKeys = ((await publicTemplates('de')).json<PublicListBody>().templates ?? []).map(
        (entry) => entry.key,
      )

      expect(publicKeys.indexOf(frequentKey)).toBeLessThan(publicKeys.indexOf(rareKey))

      const adminKeys = ((await listTemplates(cookies['admin']))
        .json<TemplateListBody>()
        .templates ?? []).map((template) => template.key)

      expect(adminKeys.indexOf(frequentKey)).toBeLessThan(adminKeys.indexOf(rareKey))
    })

    it('rejects a body without both translations', async () => {
      const response = await createTemplate(cookies['admin'], {
        translations: { de: 'Nur Deutsch' },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>().code).toBe('invalid_request')
    })
  },
)
