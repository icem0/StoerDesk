import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { evaluateTicketEscalations } from '../../tickets/escalation'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped stage chain exit integration: ${testDatabase.reason}\n`)
}

const { objects, tickets, ticketEvents, escalationFirings, escalationStages } = schema

type StageBody = {
  key: string
  names: Record<string, string>
  position: number
  active: boolean
  predecessor: string | null
  reachedBy: string[]
}

type ConfigBody = {
  stages: StageBody[]
  rules: {
    key: string
    stageKey: string | null
    reference: string | null
    minutes: Record<string, number> | null
    percent: number | null
    condition: unknown
    actions: { key: string; type: string }[]
    active: boolean
  }[]
}

type DetailBody = {
  availableStages: { key: string; names: Record<string, string>; events: string[] }[]
  events: { type: string; payload: Record<string, unknown> }[]
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const MINUTE = 60 * 1000
const NOW = new Date('2026-11-05T12:00:00.000Z')

describe.skipIf(testDatabase.status === 'unavailable')(
  'the exit criterion of the configurable stage chain (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let objectId = ''
    let adminCookie = ''
    let defaultStages: StageBody[] = []
    let ticketId = ''
    let ticketNo = ''

    async function userIdFor(email: string): Promise<string> {
      const inserted = await db
        .insert(schema.users)
        .values({ email, passwordHash: 'no-login-for-this-test-user' })
        .returning({ id: schema.users.id })

      return onlyRow(inserted, `user ${email}`).id
    }

    async function roleIdFor(key: string): Promise<string> {
      return onlyRow(
        await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.key, key)),
        key,
      ).id
    }

    async function sessionCookieFor(userId: string): Promise<string> {
      const session = await createSession(db, userId, 1)

      return `session=${session.token}`
    }

    function getConfig() {
      return app.inject({
        method: 'GET',
        url: '/api/v1/escalation/config',
        headers: { cookie: adminCookie },
      })
    }

    function putStages(payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/stages',
        headers: { cookie: adminCookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function putRules(payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/config',
        headers: { cookie: adminCookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function chainWithNightReview(): StageBody[] {
      const workOrderIndex = defaultStages.findIndex((stage) => stage.key === 'work_order')

      return [
        ...defaultStages.slice(0, workOrderIndex),
        {
          key: 'night_review',
          names: { de: 'Nachtsichtung', en: 'Night review' },
          position: defaultStages[workOrderIndex]!.position,
          active: true,
          predecessor: 'review',
          reachedBy: ['work_order_set'],
        },
        ...defaultStages.slice(workOrderIndex).map((stage) => ({
          ...stage,
          position: stage.position + 1,
          predecessor: stage.key === 'work_order' ? 'night_review' : stage.predecessor,
        })),
      ]
    }

    async function createReviewTicket() {
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          status: 'IN_REVIEW',
          priority: 'normal',
          reportedAt: new Date(NOW.getTime() - 30 * MINUTE),
          receivedAt: new Date(NOW.getTime() - 30 * MINUTE),
          deadlineAt: new Date(NOW.getTime() + 30 * MINUTE),
        })
        .returning({ id: tickets.id, ticketNo: tickets.ticketNo })

      const row = onlyRow(ticket === undefined ? [] : [ticket], 'ticket')

      await db.insert(ticketEvents).values({
        ticketId: row.id,
        type: 'review_started',
        actorKind: 'system',
        createdAt: new Date(NOW.getTime() - 20 * MINUTE),
      })

      ticketId = row.id
      ticketNo = row.ticketNo
    }

    function getDetail() {
      return app.inject({
        method: 'GET',
        url: `/api/v1/tickets/${ticketNo}`,
        headers: { cookie: adminCookie },
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await seedEscalation(db)

      const [object] = await db
        .insert(objects)
        .values({ objectNo: `CHAIN-${randomUUID().slice(0, 6)}`, name: 'Chain probe' })
        .returning({ id: objects.id })

      objectId = object?.id ?? ''

      const adminId = await userIdFor('admin-stage-chain@example.org')

      await db.insert(schema.userRoles).values({
        userId: adminId,
        roleId: await roleIdFor('admin'),
      })

      adminCookie = await sessionCookieFor(adminId)

      process.env.DATABASE_URL = url
      process.env.NODE_ENV = 'test'
      process.env.API_LOG_LEVEL = 'silent'
      process.env.RATE_LIMIT_MAX = '10000'

      app = await buildServer()

      const initial = await getConfig()

      expect(initial.statusCode).toBe(200)
      defaultStages = initial.json<ConfigBody>().stages
    })

    afterAll(async () => {
      await app.close()
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    it('adds night_review between review and work_order in one write', async () => {
      const response = await putStages({ stages: chainWithNightReview() })

      expect(response.statusCode, response.body).toBe(200)

      const body = response.json<ConfigBody>()
      const byKey = new Map(body.stages.map((stage) => [stage.key, stage]))

      expect(body.stages.map((stage) => stage.key)).toEqual(
        chainWithNightReview().map((stage) => stage.key),
      )
      expect(body.stages.map((stage) => stage.position)).toEqual(
        chainWithNightReview().map((stage) => stage.position),
      )
      expect(byKey.get('night_review')?.predecessor).toBe('review')
      expect(byKey.get('work_order')?.predecessor).toBe('night_review')
      // The timer of a rule names its own start value (ADR-0064): a new
      // predecessor leaves it untouched, the former reference repair is gone.
      const workOrder = body.rules.find((rule) => rule.key === 'work_order#1')

      expect(workOrder).not.toHaveProperty('reference')
      expect(JSON.stringify(workOrder?.condition)).toContain('review_started')
    })

    it('writes the rule of the new stage', async () => {
      const response = await putRules({
        rules: [
          {
            key: 'night_review',
            stageKey: 'night_review',
            reference: null,
            minutes: { low: 10, normal: 10, high: 10, critical: 5 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.rules.map((rule) => rule.key)).toEqual(['night_review#1'])
    })

    it('fires the stage rule once after its clock and offers the stages of the chain', async () => {
      await createReviewTicket()

      const fired = await evaluateTicketEscalations(db, ticketId, NOW)

      expect(fired.filter((entry) => entry.rule === 'night_review#1')).toHaveLength(1)

      const rows = await db
        .select()
        .from(escalationFirings)
        .where(
          and(
            eq(escalationFirings.ticketId, ticketId),
            eq(escalationFirings.ruleKey, 'night_review#1'),
          ),
        )

      expect(rows).toHaveLength(1)
      expect(rows[0]?.stageKey).toBe('night_review')

      const again = await evaluateTicketEscalations(db, ticketId, NOW)

      expect(again).toHaveLength(0)
      expect(
        await db
          .select()
          .from(escalationFirings)
          .where(
            and(
              eq(escalationFirings.ticketId, ticketId),
              eq(escalationFirings.ruleKey, 'night_review#1'),
            ),
          ),
      ).toHaveLength(1)

      const detail = await getDetail()

      expect(detail.statusCode).toBe(200)

      const body = detail.json<DetailBody>()

      const byKey = new Map(body.availableStages.map((stage) => [stage.key, stage]))

      expect(byKey.get('night_review')?.events).toEqual(['work_order_set'])
      expect(byKey.get('work_order')?.events).toEqual(['work_order_set'])
      expect(
        body.events.filter((event) => event.type === 'escalated' && event.payload.stage === 'night_review'),
      ).toHaveLength(1)
    })

    it('refuses a second stage without a predecessor and removes it', async () => {
      const extra: StageBody = {
        key: 'extra_root',
        names: { de: 'Zweite Wurzel', en: 'Second root' },
        position: 7,
        active: true,
        predecessor: null,
        reachedBy: [],
      }

      const rejected = await putStages({ stages: [...defaultStages, extra] })

      expect(rejected.statusCode).toBe(400)
      expect(rejected.json()).toMatchObject({ code: 'invalid_request' })

      // A stage without a predecessor that an earlier version of the service
      // wrote is removed; the first stage stays.
      await db.insert(escalationStages).values({
        key: extra.key,
        names: extra.names,
        position: extra.position,
        active: extra.active,
        predecessor: extra.predecessor,
        reachedBy: extra.reachedBy,
      })

      const removed = await putStages({ stages: defaultStages })

      expect(removed.statusCode).toBe(200)
      expect(removed.json<ConfigBody>().stages.map((stage) => stage.key)).not.toContain('extra_root')
    })

    it('refuses to delete or demote the first stage', async () => {
      const firstStage = defaultStages.find((stage) => stage.predecessor === null)

      if (firstStage === undefined) {
        throw new Error('expected a first stage without a predecessor')
      }

      const replacement = defaultStages.map((stage) =>
        stage.key === firstStage.key
          ? { ...stage, key: 'new_root' }
          : stage.predecessor === firstStage.key
            ? { ...stage, predecessor: 'new_root' }
            : stage,
      )

      const response = await putStages({ stages: replacement })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'invalid_request' })
    })

    it('removes the stage and its rule but keeps the firing and the event', async () => {
      const response = await putStages({ stages: defaultStages })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.stages.map((stage) => stage.key)).not.toContain('night_review')
      expect(body.rules.map((rule) => rule.key)).not.toContain('night_review#1')

      const rows = await db
        .select()
        .from(escalationFirings)
        .where(
          and(
            eq(escalationFirings.ticketId, ticketId),
            eq(escalationFirings.ruleKey, 'night_review#1'),
          ),
        )

      expect(rows).toHaveLength(1)
      expect(rows[0]?.stageKey).toBe('night_review')

      const detail = await getDetail()

      expect(detail.statusCode).toBe(200)

      const detailBody = detail.json<DetailBody>()

      expect(detailBody.availableStages.map((stage) => stage.key)).not.toContain('night_review')
      expect(detailBody.availableStages.map((stage) => stage.key)).toContain('work_order')
      expect(
        detailBody.events.filter(
          (event) => event.type === 'escalated' && event.payload.stage === 'night_review',
        ),
      ).toHaveLength(1)
    })
  },
)
