import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped TV routes: ${testDatabase.reason}\n`)
}

const { objects, settings, tickets } = schema

type TvBody = {
  generatedAt: string
  faultFree: { since: string | null; days: number; recordDays: number }
  tiles: {
    open: number
    openByStatus: Record<string, number>
    overdue: number
    unreviewed: number
    poolSize: number
    onCall: { kind: string; phone: string | null } | null
    channels: { name: string }[] | null
  }
  burningNow: Array<{
    ticketNo: string
    objectName: string
    status: string
    priority: string
    deadlineAt: string
    reportedAt: string
  }>
}

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('TV routes (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance

  const now = new Date()
  // 32 bytes of randomness, base64url encoded (43 characters).
  const tvToken = randomBytes(32).toString('base64url')

  function getTv(token: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/tv/${token}`,
    })
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const objectId = onlyRow(
      await db
        .insert(objects)
        .values({ objectNo: `TV_${Date.now().toString(36)}`, name: 'Feuerwache Nord' })
        .returning({ id: objects.id }),
      'the inserted object',
    ).id

    await db.insert(tickets).values({
      objectId,
      ticketNo: 'ST-2026-0001',
      status: 'NEW',
      priority: 'normal',
      source: 'QR',
      reportedAt: now,
      receivedAt: now,
      deadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      isTest: false,
      suspectedSpam: false,
    })

    // Configure a TV token so the wall display can be addressed.
    await db.insert(settings).values({
      key: 'dashboard.tv_token',
      value: tvToken,
    })

    process.env.DATABASE_URL = url
    process.env.API_LOG_LEVEL = 'silent'

    app = await buildServer()
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('answers 404 without a configured token', async () => {
    await db.delete(settings).where(eq(settings.key, 'dashboard.tv_token'))

    const response = await getTv(tvToken)

    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorResponseBody>()).toEqual({
      code: 'tv_not_found',
      params: {},
    })
  })

  it('answers 404 for a wrong token', async () => {
    await db.insert(settings).values({
      key: 'dashboard.tv_token',
      value: tvToken,
    })

    const response = await getTv('wrong-token-wrong-token-wrong-tok')

    expect(response.statusCode).toBe(404)
    expect(response.json<ErrorResponseBody>()).toEqual({
      code: 'tv_not_found',
      params: {},
    })
  })

  it('answers the snapshot for a valid token without contact data', async () => {
    const response = await getTv(tvToken)

    expect(response.statusCode).toBe(200)
    const body = response.json<TvBody>()

    expect(body.tiles.channels).toBeNull()
    expect(body.tiles.onCall).not.toBeNull()
    expect(body.tiles.onCall?.phone).toBeNull()
    const row = onlyRow(body.burningNow, 'burning row')

    expect(row.ticketNo).toBe('ST-2026-0001')
    expect(row.objectName).toBe('Feuerwache Nord')
  })

  it('anonymises object names when tv_anonymize is true', async () => {
    await db
      .insert(settings)
      .values({ key: 'dashboard.tv_anonymize', value: true })

    const response = await getTv(tvToken)

    expect(response.statusCode).toBe(200)
    const body = response.json<TvBody>()

    const row = onlyRow(body.burningNow, 'burning row')

    expect(row.ticketNo).toBe('ST-2026-0001')
    expect(row.objectName).not.toBe('Feuerwache Nord')
    expect(row.objectName).toMatch(/^Object-[A-Za-z0-9]{8}$/)
  })
})
