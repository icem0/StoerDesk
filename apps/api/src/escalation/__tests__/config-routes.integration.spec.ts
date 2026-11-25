import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  DEFAULT_WORKFLOW_ESCALATION_STAGES,
} from '@stoerdesk/shared'

import { createSession } from '../../auth/session'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedEscalation } from '../../db/seed-escalation'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped escalation config integration: ${testDatabase.reason}\n`)
}

const { groups, notificationChannels, oncallPools, users, roles, userRoles } = schema

type ErrorResponseBody = { code?: string; params?: Record<string, unknown> }

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
    actions: {
      key: string
      type: string
      text?: string
      target?: { kind: string; id: string }
      mode?: string
      user?: string
      acceptance?: boolean
    }[]
    active: boolean
  }[]
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

const DEFAULT_CHAIN: StageBody[] = DEFAULT_WORKFLOW_ESCALATION_STAGES.map((stage) => ({
  key: stage.key,
  names: stage.names,
  position: stage.position,
  active: stage.active,
  predecessor: stage.predecessor,
  reachedBy: stage.reachedBy,
}))

describe.skipIf(testDatabase.status === 'unavailable')(
  'the escalation configuration API — GET and PUT (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance
    let officeUserId = ''
    const cookies: Record<'admin' | 'office', string> = { admin: '', office: '' }

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

    function getConfig(cookie?: string) {
      return app.inject({
        method: 'GET',
        url: '/api/v1/escalation/config',
        headers: cookie === undefined ? {} : { cookie },
      })
    }

    function putConfig(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/config',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    function putStages(cookie: string, payload: unknown) {
      return app.inject({
        method: 'PUT',
        url: '/api/v1/escalation/stages',
        headers: { cookie },
        payload: payload as Record<string, unknown>,
      })
    }

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
      await seedRbac(db)
      await seedEscalation(db)

      const adminId = await userIdFor('admin-escalation@example.org')
      const officeId = await userIdFor('office-escalation@example.org')
      officeUserId = officeId

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

    it('answers 401 to an anonymous read and write', async () => {
      expect((await getConfig()).statusCode).toBe(401)
      expect((await putConfig('session=invalid', { rules: [] })).statusCode).toBe(401)
    })

    it('refuses the write for a role without settings.write', async () => {
      expect((await getConfig(cookies['office'])).statusCode).toBe(200)
      expect((await putConfig(cookies['office'], { rules: [] })).statusCode).toBe(403)
    })

    it('names the mailbox of the administration in the channels of the stages (WP-M41-02)', async () => {
      await db.insert(notificationChannels).values({
        kind: 'email',
        name: 'email',
        enabled: true,
        config: { host: 'smtp.office365.com', from: 'office@example.invalid' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/escalation/channels',
        headers: { cookie: cookies['admin'] },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<{ channels: string[] }>().channels).toContain('email')
    })

    it('answers the stages and the rules of the seed', async () => {      const response = await getConfig(cookies['admin'])

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.stages.map((stage) => stage.key)).toEqual(
        DEFAULT_WORKFLOW_ESCALATION_STAGES.map((stage) => stage.key),
      )
      expect(body.rules.map((rule) => rule.key)).toContain(
        DEFAULT_WORKFLOW_ESCALATION_RULES.find((rule) => rule.percent === 100)?.key,
      )
    })

    it('replaces the rules and their actions', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 20, normal: 20, high: 20, critical: 8 },
            percent: null,
            condition: { all: [{ field: 'priority', operator: 'in', value: ['high', 'critical'] }] },
            actions: [
              {
                key: 'office_webhook',
                type: 'webhook',
                endpointIds: ['11111111-1111-4111-8111-111111111111'],
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.rules).toHaveLength(1)
      expect(body.rules[0]?.actions[0]?.type).toBe('webhook')
      expect(body.rules[0]?.minutes).toEqual({ low: 20, normal: 20, high: 20, critical: 8 })
    })

    it('numbers the rule and its actions', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 20, normal: 20, high: 20, critical: 8 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                type: 'history',
                text: 'Das Büro wurde informiert.',
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const action = response.json<ConfigBody>().rules[0]?.actions[0]

      expect(action?.type).toBe('history')
      expect(action?.key).toBe('review#1#1')
      expect(action?.text).toBe('Das Büro wurde informiert.')
      expect(response.json<ConfigBody>().rules[0]?.key).toBe('review#1')
    })

    it('numbers the second rule of a stage with two', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 20, normal: 20, high: 20, critical: 8 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 30, normal: 30, high: 30, critical: 12 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const rules = response.json<ConfigBody>().rules

      expect(rules.map((rule) => rule.key)).toEqual(['review#1', 'review#2'])
    })

    it('rejects a rule of an unknown stage and a malformed body', async () => {
      const unknownStage = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'broken',
            stageKey: 'office',
            reference: 'received_at',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(unknownStage.statusCode).toBe(400)
      expect(unknownStage.json<ErrorResponseBody>().code).toBe('invalid_request')

      const malformed = await putConfig(cookies['admin'], { rules: [{ key: 'no-clock' }] })

      expect(malformed.statusCode).toBe(400)
      expect(malformed.json<ErrorResponseBody>().code).toBe('invalid_request')
    })

    it('refuses a status_change to an unknown status with 400 invalid_status_key', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'review',
            stageKey: 'review',
            reference: 'received_at',
            minutes: { low: 15, normal: 15, high: 15, critical: 5 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'to_ghost',
                type: 'status_change',
                toStatus: 'GHOST_STATUS',
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(400)

      const body = response.json<ErrorResponseBody>()

      expect(body.code).toBe('invalid_status_key')
      expect(body.params?.fields).toEqual(['rules.0.actions.0.toStatus'])
    })

    it('keeps the target of an offer and of an assign action', async () => {
      const suffix = Date.now().toString(36)

      const [group] = await db
        .insert(groups)
        .values({ name: `Verteilergruppe ${suffix}` })
        .returning({ id: groups.id })
      const groupId = group?.id ?? ''

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Verteilerpool ${suffix}`, groupId })
        .returning({ id: oncallPools.id })
      const poolId = pool?.id ?? ''

      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'offer_the_pool',
                type: 'offer',
                target: { kind: 'pool', id: poolId },
                condition: { all: [] },
              },
              {
                key: 'assign_the_technician',
                type: 'assign',
                target: { kind: 'user', id: officeUserId },
                acceptance: true,
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.rules[0]?.actions[0]?.target).toEqual({ kind: 'pool', id: poolId })
      expect(body.rules[0]?.actions[1]?.target).toEqual({ kind: 'user', id: officeUserId })
      expect(body.rules[0]?.actions[1]?.acceptance).toBe(true)
    })

    it('refuses a target of an unknown pool and an unknown technician with 400 invalid_target', async () => {
      const response = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'offer_the_ghost',
                type: 'offer',
                target: { kind: 'pool', id: '11111111-1111-4111-8111-111111111111' },
                condition: { all: [] },
              },
              {
                key: 'assign_the_ghost',
                type: 'assign',
                target: { kind: 'user', id: '22222222-2222-4222-8222-222222222222' },
                acceptance: true,
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(response.statusCode).toBe(400)

      const body = response.json<ErrorResponseBody>()

      expect(body.code).toBe('invalid_target')
      expect(body.params?.fields).toEqual([
        'rules.0.actions.0.target.id',
        'rules.0.actions.1.target.id',
      ])
    })


    it('writes and reads an assign action with a target and refuses an unknown target', async () => {
      const suffix = Date.now().toString(36)

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Zielfpool ${suffix}` })
        .returning({ id: oncallPools.id })
      const poolId = pool?.id ?? ''

      const written = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'assign_the_pool',
                type: 'assign',
                target: { kind: 'pool', id: poolId },
                acceptance: true,
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(written.statusCode).toBe(200)

      const body = written.json<ConfigBody>()

      expect(body.rules[0]?.actions[0]?.target).toEqual({ kind: 'pool', id: poolId })
      expect(body.rules[0]?.actions[0]?.acceptance).toBe(true)

      const refused = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [
              {
                key: 'assign_the_ghost',
                type: 'assign',
                target: { kind: 'pool', id: '33333333-3333-4333-8333-333333333333' },
                acceptance: true,
                condition: { all: [] },
              },
            ],
            active: true,
          },
        ],
      })

      expect(refused.statusCode).toBe(400)

      const refusedBody = refused.json<ErrorResponseBody>()

      expect(refusedBody.code).toBe('invalid_target')
      expect(refusedBody.params?.fields).toEqual(['rules.0.actions.0.target.id'])
    })

    it('keeps a condition that names a readiness pool and refuses an unknown one', async () => {
      const suffix = Date.now().toString(36)

      const [pool] = await db
        .insert(oncallPools)
        .values({ name: `Schichtpool ${suffix}` })
        .returning({ id: oncallPools.id })
      const poolId = pool?.id ?? ''

      const known = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [{ field: 'shift', operator: 'eq', value: poolId }] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(known.statusCode).toBe(200)

      const unknown = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'assignment',
            stageKey: 'assignment',
            reference: 'work_order_set',
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: {
              all: [{ field: 'shift', operator: 'eq', value: '33333333-3333-4333-8333-333333333333' }],
            },
            actions: [],
            active: true,
          },
        ],
      })

      expect(unknown.statusCode).toBe(400)

      const body = unknown.json<ErrorResponseBody>()

      expect(body.code).toBe('invalid_target')
      expect(body.params?.fields).toEqual(['rules.0.condition'])
    })

    it('replaces the names of the stages and keeps their chain', async () => {
      const response = await putStages(cookies['admin'], {
        stages: DEFAULT_CHAIN.map((stage) =>
          stage.key === 'review'
            ? { ...stage, names: { de: 'Prüfung des Büros', en: 'Office review' } }
            : stage,
        ),
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()
      const byKey = new Map(body.stages.map((stage) => [stage.key, stage]))

      expect(byKey.get('review')?.names.de).toBe('Prüfung des Büros')
      expect(byKey.get('work_order')?.predecessor).toBe('review')
    })

    it('adds an intermediate stage between assignment and acceptance', async () => {
      const acceptanceIndex = DEFAULT_CHAIN.findIndex((stage) => stage.key === 'acceptance')
      const response = await putStages(cookies['admin'], {
        stages: [
          ...DEFAULT_CHAIN.slice(0, acceptanceIndex),
          {
            key: 'night_shift',
            names: { de: 'Nachtdienst', en: 'Night shift' },
            position: DEFAULT_CHAIN[acceptanceIndex]!.position,
            active: true,
            predecessor: 'assignment',
            reachedBy: ['claimed'],
          },
          ...DEFAULT_CHAIN.slice(acceptanceIndex).map((stage, offset) => ({
            ...stage,
            position: stage.position + 1,
            predecessor: offset === 0 ? 'night_shift' : stage.predecessor,
          })),
        ],
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()
      const byKey = new Map(body.stages.map((stage) => [stage.key, stage]))

      expect(byKey.get('night_shift')?.predecessor).toBe('assignment')
      expect(byKey.get('acceptance')?.predecessor).toBe('night_shift')
      expect(body.stages.map((stage) => stage.key)).toEqual([
        ...DEFAULT_CHAIN.slice(0, acceptanceIndex).map((stage) => stage.key),
        'night_shift',
        ...DEFAULT_CHAIN.slice(acceptanceIndex).map((stage) => stage.key),
      ])
    })

    it('removes a stage and cascades to its rules', async () => {
      const writeRules = await putConfig(cookies['admin'], {
        rules: [
          {
            key: 'night_shift',
            stageKey: 'night_shift',
            reference: null,
            minutes: { low: 10, normal: 10, high: 10, critical: 10 },
            percent: null,
            condition: { all: [] },
            actions: [],
            active: true,
          },
        ],
      })

      expect(writeRules.statusCode).toBe(200)
      expect(await db.select().from(schema.escalationRules)).toHaveLength(1)

      const response = await putStages(cookies['admin'], {
        stages: DEFAULT_CHAIN,
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<ConfigBody>()

      expect(body.stages.map((stage) => stage.key)).toEqual(
        DEFAULT_CHAIN.map((stage) => stage.key),
      )
      expect(await db.select().from(schema.escalationRules)).toHaveLength(0)
    })

    it('rejects a stage body with an unknown predecessor', async () => {
      const response = await putStages(cookies['admin'], {
        stages: [
          {
            key: 'office',
            names: { de: 'Büro', en: 'Office' },
            position: 1,
            active: true,
            predecessor: 'missing',
            reachedBy: [],
          },
        ],
      })

      expect(response.statusCode).toBe(400)

      const body = response.json<ErrorResponseBody>()

      expect(body.code).toBe('invalid_request')
      expect(body.params?.fields).toEqual(['stages.0.predecessor'])
    })
  },
)
