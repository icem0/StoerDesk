import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { buildServer } from '../../index'
import { tamperedSignature } from './helpers/icalToken'
import { icalTokenFor } from '../ical'
import { seedRbac } from '../../db/seed-rbac'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped on-call iCal integration: ${testDatabase.reason}\n`)
}

const { oncallPools, oncallShifts, roles, userRoles, users } = schema
const secret = 'ical-integration-secret'
const DAY = 24 * 60 * 60 * 1000

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

function shiftCount(calendar: string): number {
  return calendar.split('BEGIN:VEVENT').length - 1
}

describe.skipIf(testDatabase.status === 'unavailable')('on-call iCal feed (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let app: FastifyInstance
  let userId = ''
  let otherUserId = ''
  let poolId = ''

  async function userIdFor(email: string, locale: string): Promise<string> {
    const inserted = await db
      .insert(users)
      .values({ email, passwordHash: 'no-login-for-ical-user', locale })
      .returning({ id: users.id })

    return onlyRow(inserted, `user ${email}`).id
  }

  async function addShift(input: {
    userId: string | null
    state: string
    daysFromNow: number
  }): Promise<void> {
    const startsAt = new Date(Date.now() + input.daysFromNow * DAY)

    await db.insert(oncallShifts).values({
      poolId,
      userId: input.userId,
      state: input.state,
      startsAt,
      endsAt: new Date(startsAt.getTime() + DAY),
    })
  }

  function getFeed(token: string) {
    return app.inject({ method: 'GET', url: `/api/v1/oncall/ical/${token}.ics` })
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    userId = await userIdFor('ical-user@example.org', 'en')
    otherUserId = await userIdFor('ical-other@example.org', 'de')

    poolId = onlyRow(
      await db
        .insert(oncallPools)
        .values({ name: 'Bereitschaft, Nord' })
        .returning({ id: oncallPools.id }),
      'pool',
    ).id

    await addShift({ userId, state: 'PLANNED', daysFromNow: 3 })
    await addShift({ userId, state: 'CONFIRMED', daysFromNow: 10 })
    await addShift({ userId, state: 'DECLINED', daysFromNow: 17 })
    await addShift({ userId, state: 'UNFILLED', daysFromNow: 24 })
    await addShift({ userId, state: 'PLANNED', daysFromNow: 200 })
    await addShift({ userId, state: 'PLANNED', daysFromNow: -40 })
    await addShift({ userId: otherUserId, state: 'CONFIRMED', daysFromNow: 31 })

    process.env.DATABASE_URL = url
    process.env.NODE_ENV = 'test'
    process.env.API_LOG_LEVEL = 'silent'
    process.env.RATE_LIMIT_MAX = '10000'
    process.env.SESSION_SECRET = secret

    app = await buildServer()

    // SEC-005: the iCal handler re-checks `oncall.read` at request time — the test
    // user needs the system `oncall` role for the feed to work. Grant it after
    // `buildServer()` (which seeds `roles` and `role_permissions`).
    const [oncallRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'oncall'))
      .limit(1)
    await db.insert(userRoles).values({ userId, roleId: onlyRow(oncallRole ? [oncallRole] : [], 'the oncall role').id })
  })

  afterAll(async () => {
    await app.close()
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('answers PLANNED and CONFIRMED shifts inside the range as a calendar', async () => {
    const response = await getFeed(icalTokenFor(userId, secret))

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/calendar')
    expect(response.headers['content-type']).toContain('charset=utf-8')

    const calendar = response.body
    expect(shiftCount(calendar)).toBe(2)
    expect(calendar).toContain('BEGIN:VCALENDAR\r\n')
    expect(calendar).toContain('VERSION:2.0\r\n')
    expect(calendar).toContain('SUMMARY:On-call: Bereitschaft\\, Nord\r\n')
    expect(calendar).toContain('DESCRIPTION:On-call shift in pool Bereitschaft\\, Nord.')
    expect(calendar).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/)
    expect(calendar).toMatch(/DTEND:\d{8}T\d{6}Z\r\n/)
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('answers 404 for a malformed, tampered or unknown-user token', async () => {
    const valid = icalTokenFor(userId, secret)
    const [id, signature] = valid.split('.') as [string, string]
    const unknownUser = icalTokenFor(randomUUID(), secret)

    for (const token of [
      'not-a-token',
      `${id}.${tamperedSignature(signature)}`,
      unknownUser,
      icalTokenFor(userId, 'another-secret'),
    ]) {
      const response = await getFeed(token)

      expect(response.statusCode).toBe(404)
      expect(response.json<ErrorResponseBody>()).toEqual({ code: 'ical_not_found', params: {} })
    }
  })
})
