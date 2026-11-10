import { eq, like } from 'drizzle-orm'
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
import { readDeadlineHours } from '../../tickets/deadline'
import { readOverrides, readStageTexts } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped deadline settings integration: ${testDatabase.reason}\n`)
}

const { users, roles, userRoles, settings } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }
type StageText = { label: { de: string; en: string }; description: { de: string; en: string } }
type StageTexts = {
  new_without_review: StageText
  work_order_without_distribution: StageText
  offered_without_claim: StageText
  assigned_without_accept: StageText
  deadline_80_percent: StageText
  deadline_exceeded: StageText
}
type DeadlineBody = {
  hours: Record<string, number>
  reactionMinutes: Record<string, { standard: number; critical: number }>
  stageTexts: StageTexts
}

const defaults: DeadlineBody = {
  hours: { low: 168, normal: 72, high: 24, critical: 8 },
  reactionMinutes: {
    new_without_review: { standard: 15, critical: 5 },
    work_order_without_distribution: { standard: 30, critical: 30 },
    offered_without_claim: { standard: 20, critical: 10 },
    assigned_without_accept: { standard: 15, critical: 15 },
  },
  stageTexts: {
    new_without_review: {
      label: { de: 'Prüfung', en: 'Review' },
      description: { de: 'Meldung noch nicht geprüft', en: 'Report not reviewed yet' },
    },
    work_order_without_distribution: {
      label: { de: 'Arbeitsauftrag', en: 'Work order' },
      description: {
        de: 'Arbeitsauftrag noch nicht erstellt',
        en: 'Work order not created yet',
      },
    },
    offered_without_claim: {
      label: { de: 'Übernahme', en: 'Claim' },
      description: { de: 'Angebot noch nicht übernommen', en: 'Offer not claimed yet' },
    },
    assigned_without_accept: {
      label: { de: 'Annahme', en: 'Acceptance' },
      description: { de: 'Auftrag noch nicht angenommen', en: 'Work order not accepted yet' },
    },
    deadline_80_percent: {
      label: { de: 'Frist zu 80 %', en: '80 % of the deadline' },
      description: {
        de: '80 % der Bearbeitungsfrist erreicht',
        en: '80 % of the processing deadline reached',
      },
    },
    deadline_exceeded: {
      label: { de: 'Frist überschritten', en: 'Deadline exceeded' },
      description: {
        de: 'Bearbeitungsfrist überschritten',
        en: 'Processing deadline exceeded',
      },
    },
  },
}

const changed: DeadlineBody = {
  hours: { low: 200, normal: 48, high: 12, critical: 4 },
  reactionMinutes: {
    new_without_review: { standard: 25, critical: 7 },
    work_order_without_distribution: { standard: 40, critical: 35 },
    offered_without_claim: { standard: 30, critical: 12 },
    assigned_without_accept: { standard: 20, critical: 18 },
  },
  stageTexts: {
    new_without_review: {
      label: { de: 'Sichtung', en: 'Triage' },
      description: { de: 'Sichtung noch nicht erfolgt', en: 'Triage not done yet' },
    },
    work_order_without_distribution: {
      label: { de: 'Disposition', en: 'Dispatch' },
      description: { de: 'Disposition noch nicht erfolgt', en: 'Dispatch not done yet' },
    },
    offered_without_claim: {
      label: { de: 'Übernahme', en: 'Claim' },
      description: { de: 'Angebot noch nicht übernommen', en: 'Offer not claimed yet' },
    },
    assigned_without_accept: {
      label: { de: 'Annahme', en: 'Acceptance' },
      description: { de: 'Auftrag noch nicht angenommen', en: 'Work order not accepted yet' },
    },
    deadline_80_percent: {
      label: { de: 'Frist zu 80 %', en: '80 % of the deadline' },
      description: {
        de: '80 % der Bearbeitungsfrist erreicht',
        en: '80 % of the processing deadline reached',
      },
    },
    deadline_exceeded: {
      label: { de: 'Frist überschritten', en: 'Deadline exceeded' },
      description: {
        de: 'Bearbeitungsfrist überschritten',
        en: 'Processing deadline exceeded',
      },
    },
  },
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'deadline settings API — GET and PUT /api/v1/settings/deadlines (integration)',
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

    function getDeadlines(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/deadlines',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function getDeadlineHours(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/settings/deadline-hours',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putDeadlines(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/settings/deadlines',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await db.delete(settings).where(like(settings.key, 'ticket.%'))

      const adminId = await userIdFor('admin-deadlines@example.org')
      const officeId = await userIdFor('office-deadlines@example.org')
      const reporterId = await userIdFor('reporter-deadlines@example.org')

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

    it('answers 401 to an anonymous GET and PUT', async () => {
      expect((await getDeadlines()).statusCode).toBe(401)
      expect((await getDeadlineHours()).statusCode).toBe(401)
      expect((await putDeadlines('session=invalid', changed)).statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      const get = await getDeadlines(cookies['office'])
      const put = await putDeadlines(cookies['office'], changed)

      expect(get.statusCode).toBe(200)
      expect(put.statusCode).toBe(403)
      expect(put.json<ErrorResponseBody>()).toEqual({ code: 'forbidden', params: {} })
    })

    it('answers the shared defaults before anything is configured', async () => {
      const response = await getDeadlines(cookies['admin'])

      expect(response.statusCode).toBe(200)
      expect(response.json<DeadlineBody>()).toEqual(defaults)
    })

    it('lets a ticket creator read the deadline hours without settings.read', async () => {
      const response = await getDeadlineHours(cookies['reporter'])

      expect(response.statusCode).toBe(200)
      expect(response.json<Record<string, number>>()).toEqual(defaults.hours)
    })

    it('stores the values and returns them on the next read', async () => {
      const put = await putDeadlines(cookies['admin'], changed)

      expect(put.statusCode).toBe(200)
      expect(put.json<DeadlineBody>()).toEqual(changed)

      const get = await getDeadlines(cookies['admin'])

      expect(get.json<DeadlineBody>()).toEqual(changed)

      const hours = await getDeadlineHours(cookies['reporter'])

      expect(hours.json<Record<string, number>>()).toEqual(changed.hours)
    })

    it('feeds the stored values into the deadline and escalation calculation', async () => {
      const hours = await readDeadlineHours(db)
      const overrides = await readOverrides(db)

      expect(hours).toEqual(changed.hours)
      expect(overrides.new_without_review).toEqual({ minutes: 25, criticalMinutes: 7 })
    })

    it('stores a stage text that differs from the default and drops an unchanged one', async () => {
      await putDeadlines(cookies['admin'], changed)

      const rows = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(like(settings.key, 'ticket.escalation.%'))

      const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]))

      expect(byKey['ticket.escalation.new_without_review.label']).toEqual(
        changed.stageTexts.new_without_review.label,
      )
      expect(byKey['ticket.escalation.new_without_review.description']).toEqual(
        changed.stageTexts.new_without_review.description,
      )
      expect(byKey['ticket.escalation.deadline_exceeded.label']).toBeUndefined()
      expect(byKey['ticket.escalation.deadline_80_percent.description']).toBeUndefined()
    })

    it('reads the effective stage texts back, defaults included', async () => {
      const texts = await readStageTexts(db)

      expect(texts.new_without_review).toEqual(changed.stageTexts.new_without_review)
      expect(texts.deadline_exceeded).toEqual(defaults.stageTexts.deadline_exceeded)
    })

    it('rejects an out-of-range value with 400 invalid_request and the field path', async () => {
      const response = await putDeadlines(cookies['admin'], {
        ...changed,
        hours: { ...changed.hours, critical: 0 },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json<ErrorResponseBody>()).toEqual({
        code: 'invalid_request',
        params: { fields: ['hours.critical'] },
      })
      expect((await getDeadlines(cookies['admin'])).json<DeadlineBody>()).toEqual(changed)
    })
  },
)
