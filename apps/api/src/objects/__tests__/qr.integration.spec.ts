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
  process.stderr.write(`skipped qr integration: ${testDatabase.reason}\n`)
}

const { objects, oldQrTokens, roles, userRoles, users } = schema

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

type ObjectBody = {
  id: string
  objectNo: string
  qrToken: string | null
}
type RegenerateBody = { qrToken?: string }
type ResolveBody = {
  token?: string
  redirected?: boolean
  object?: { objectNo?: string }
}
type ErrorBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: (T | undefined)[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('objects QR API (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

  async function userIdFor(email: string): Promise<string> {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash: 'no-login-for-this-qr-test' })
      .returning({ id: users.id })

    return onlyRow(inserted, `user ${email}`).id
  }

  async function roleIdFor(key: string): Promise<string> {
    return onlyRow(await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)), key).id
  }

  async function sessionCookieFor(userId: string): Promise<string> {
    const session = await createSession(db, userId, 1)

    return `session=${session.token}`
  }

  function postObject(cookie: string, payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/v1/objects', headers: { cookie }, payload })
  }

  async function createAsAdmin(objectNo: string) {
    const response = await postObject(cookies['admin'], {
      objectNo,
      name: `QR-Objekt ${objectNo}`,
      city: 'Musterstadt',
      systems: [{ type: 'BMA', label: 'BMA' }],
    })

    expect(response.statusCode).toBe(201)

    return response.json<ObjectBody>()
  }

  function regenerate(cookie?: string, objectNo = '9001_01', payload: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/objects/${objectNo}/regenerate-qr`,
      headers: cookie === undefined ? {} : { cookie },
      payload,
    })
  }

  function resolve(token: string) {
    return app.inject({ method: 'GET', url: `/api/v1/public/qr/${token}` })
  }

  async function currentToken(objectNo: string): Promise<string> {
    const [row] = await db.select({ qrToken: objects.qrToken }).from(objects).where(
      and(eq(objects.objectNo, objectNo)),
    )

    return onlyRow([row], `object ${objectNo}`).qrToken ?? ''
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const adminId = await userIdFor('qr-admin@example.org')
    const officeId = await userIdFor('qr-office@example.org')

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

  it('creates a unique 22-character token on every object', async () => {
    const first = await createAsAdmin('9001_01')
    const second = await createAsAdmin('9002_01')

    expect(first.qrToken).toMatch(QR_TOKEN_PATTERN)
    expect(second.qrToken).toMatch(QR_TOKEN_PATTERN)
    expect(first.qrToken).not.toBe(second.qrToken)

    const ignored = 'clienttoken_____________'
    await postObject(cookies['admin'], { objectNo: '9003_01', name: 'Token given', qrToken: ignored })
    const withClientToken = await db
      .select({ qrToken: objects.qrToken })
      .from(objects)
      .where(eq(objects.objectNo, '9003_01'))

    expect(withClientToken[0]?.qrToken).toMatch(QR_TOKEN_PATTERN)
    expect(withClientToken[0]?.qrToken).not.toBe(ignored)
  })

  it('regenerates the token and retires the old one for about 30 days', async () => {
    const created = await createAsAdmin('9101_01')
    const oldToken = created.qrToken ?? ''
    const response = await regenerate(cookies['admin'], '9101_01')
    const body = response.json<RegenerateBody>()

    expect(response.statusCode).toBe(200)
    expect(body.qrToken).toMatch(QR_TOKEN_PATTERN)
    expect(body.qrToken).not.toBe(oldToken)

    const [row] = await db
      .select({ expiresAt: oldQrTokens.expiresAt })
      .from(oldQrTokens)
      .where(eq(oldQrTokens.token, oldToken))

    const retired = onlyRow([row], 'retired token')
    const days = (retired.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)

    expect(retired.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThan(31)

    const again = await regenerate(cookies['admin'], '9101_01')

    expect(again.statusCode).toBe(200)
    expect(again.json<RegenerateBody>().qrToken).not.toBe(body.qrToken)
  })

  it('resolves old tokens while they are fresh and rejects them once expired', async () => {
    const created = await createAsAdmin('9102_01')
    const oldToken = created.qrToken ?? ''
    const regenerated = await regenerate(cookies['admin'], '9102_01')
    const newToken = regenerated.json<RegenerateBody>().qrToken ?? ''

    const retired = await resolve(oldToken)
    const retiredBody = retired.json<ResolveBody>()

    expect(retired.statusCode).toBe(200)
    expect(retiredBody.redirected).toBe(true)
    expect(retiredBody.token).toBe(newToken)
    expect(retiredBody.object?.objectNo).toBe('9102_01')

    await db
      .update(oldQrTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(oldQrTokens.token, oldToken))

    const expired = await resolve(oldToken)

    expect(expired.statusCode).toBe(404)
    expect(expired.json<ErrorBody>().code).toBe('qr_token_not_found')

    const blocked = await createAsAdmin('9103_01')
    const blockedOld = blocked.qrToken ?? ''

    await regenerate(cookies['admin'], '9103_01', { blockOldToken: true })

    const immediatelyBlocked = await resolve(blockedOld)

    expect(immediatelyBlocked.statusCode).toBe(404)
    expect(immediatelyBlocked.json<ErrorBody>().code).toBe('qr_token_not_found')
  })

  it('resolves current tokens publicly and only lets object.regenerate_qr rotate', async () => {
    const created = await createAsAdmin('9104_01')
    const token = created.qrToken ?? ''

    const current = await resolve(token)
    const currentBody = current.json<ResolveBody>()

    expect(current.statusCode).toBe(200)
    expect(currentBody.redirected).toBe(false)
    expect(currentBody.token).toBe(token)
    expect(currentBody.object?.objectNo).toBe('9104_01')

    const anonymous = await regenerate(undefined)
    const denied = await regenerate(cookies['office'], '9104_01')
    const malformed = await resolve('short')
    const unknown = await resolve('a'.repeat(22))

    expect(anonymous.statusCode).toBe(401)
    expect(anonymous.json<ErrorBody>().code).toBe('session_invalid')
    expect(denied.statusCode).toBe(403)
    expect(denied.json<ErrorBody>().code).toBe('forbidden')
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json<ErrorBody>().code).toBe('invalid_request')
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json<ErrorBody>().code).toBe('qr_token_not_found')

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/v1/objects/9104_01',
      headers: { cookie: cookies['admin'] },
    })

    expect(removed.statusCode).toBe(204)
    expect((await resolve(token)).statusCode).toBe(404)
    expect(await currentToken('9104_01')).toBe(token)
  })
})
