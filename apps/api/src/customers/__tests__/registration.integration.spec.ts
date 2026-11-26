import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { buildServer } from '../../index'
import { createPendingCustomer } from '../registration'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped customer registration integration: ${testDatabase.reason}\n`)
}

const { accountTokens, notificationChannels, roles, userRoles, users, settings } = schema

type ErrorBody = { code?: string }

describe.skipIf(testDatabase.status === 'unavailable')(
  'the registration of a customer (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let app: FastifyInstance

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      // §19.13 (ADR-0062): the portal of the customer is switched off by
      // default — the tests of the portal switch it on.
      await db.insert(settings).values([
        { key: 'customer.portal_enabled', value: true },
        { key: 'customer.registration_enabled', value: true },
      ])
      await seedRbac(db)

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

    /** A mailbox that cannot send — the answers must not depend on the mail. */
    async function withMailbox(): Promise<void> {
      const existing = await db
        .select({ id: notificationChannels.id })
        .from(notificationChannels)
        .where(eq(notificationChannels.kind, 'email'))
        .limit(1)

      if (existing.length > 0) {
        return
      }

      await db.insert(notificationChannels).values({
        name: 'E-Mail',
        kind: 'email',
        enabled: true,
        label: 'SMTP',
        config: { host: '127.0.0.1', port: '1', from: 'stoerdesk@example.org' },
      })
    }

    function register(email: string) {
      return app.inject({
        method: 'POST',
        url: '/api/v1/public/auth/register',
        headers: { 'content-type': 'application/json' },
        payload: { email },
      })
    }

    it('refuses the registration without a mailbox', async () => {
      const answer = await register('ohne-postfach@example.org')

      expect(answer.statusCode).toBe(409)
      expect((answer.json() as ErrorBody).code).toBe('registration_unavailable')
    })

    it('names the availability of the registration', async () => {
      await withMailbox()

      const answer = await app.inject({ method: 'GET', url: '/api/v1/public/auth/registration' })

      expect(answer.json()).toEqual({ available: true })
    })

    it('answers every address the same way', async () => {
      await withMailbox()

      const known = await register('gibt-es-nicht@example.org')
      const unknown = await register('gibt-es-nicht@example.org')

      expect(known.statusCode).toBe(202)
      expect(known.json()).toEqual({ status: 'accepted' })
      expect(unknown.json()).toEqual(known.json())
    })

    it('registers a customer, confirms him over the link and lets him log in', async () => {
      await withMailbox()

      const customer = await createPendingCustomer(db, {
        email: 'kunde@example.org',
        givenName: 'Erika',
        familyName: 'Mustermann',
        createdVia: 'registration',
      })

      const [user] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, customer.userId))

      expect(user?.active).toBe(false)

      const [role] = await db
        .select({ key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, customer.userId))

      expect(role?.key).toBe('customer')

      const [row] = await db
        .select({ tokenHash: accountTokens.tokenHash })
        .from(accountTokens)
        .where(eq(accountTokens.userId, customer.userId))

      expect(row?.tokenHash).not.toBe(customer.token)

      const answer = await app.inject({
        method: 'POST',
        url: `/api/v1/public/auth/token/${customer.token}/password`,
        headers: { 'content-type': 'application/json' },
        payload: { password: 'a-very-long-password' },
      })

      expect(answer.statusCode).toBe(204)

      const [active] = await db
        .select({ active: users.active })
        .from(users)
        .where(eq(users.id, customer.userId))

      expect(active?.active).toBe(true)

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'kunde@example.org', password: 'a-very-long-password' },
      })

      expect(login.statusCode).toBe(200)

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/public/auth/token/${customer.token}/password`,
        headers: { 'content-type': 'application/json' },
        payload: { password: 'another-very-long-password' },
      })

      expect(second.statusCode).toBe(404)
    })

    it('refuses an unknown token', async () => {
      const answer = await app.inject({
        method: 'GET',
        url: `/api/v1/public/auth/token/${'a'.repeat(43)}`,
      })

      expect(answer.statusCode).toBe(404)
      expect((answer.json() as ErrorBody).code).toBe('token_unknown')
    })

    it('sends the link of the forgotten password', async () => {
      await withMailbox()

      const answer = await app.inject({
        method: 'POST',
        url: '/api/v1/public/auth/password-reset',
        headers: { 'content-type': 'application/json' },
        payload: { email: 'kunde@example.org' },
      })

      expect(answer.statusCode).toBe(202)
      expect(answer.json()).toEqual({ status: 'accepted' })
    })
  },
)
