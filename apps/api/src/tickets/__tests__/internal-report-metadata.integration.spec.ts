import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
import { createInternalTicket } from '../internal'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal-report metadata integration: ${testDatabase.reason}\n`)
}

const HOUR = 60 * 60 * 1000

describe.skipIf(testDatabase.status === 'unavailable')(
  'internal report metadata (WP-M2-98b)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 2 })
    const db = drizzle(client, { schema })

    let actorUserId = ''
    let reporterUserId = ''
    let objectId = ''

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })

      const [actor] = await db
        .insert(schema.users)
        .values({
          email: `recorder-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
        })
        .returning({ id: schema.users.id })
      actorUserId = actor?.id ?? ''

      const [reporter] = await db
        .insert(schema.users)
        .values({
          email: `reporter-${randomUUID()}@example.invalid`,
          passwordHash: 'not-used',
          givenName: 'Rita',
          familyName: 'Ruf',
        })
        .returning({ id: schema.users.id })
      reporterUserId = reporter?.id ?? ''

      const [object] = await db
        .insert(schema.objects)
        .values({ objectNo: `RM-${randomUUID().slice(0, 6)}`, name: 'Reporter metadata probe' })
        .returning({ id: schema.objects.id })
      objectId = object?.id ?? ''
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function createTicket(
      input: Partial<Parameters<typeof createInternalTicket>[1]> = {},
    ) {
      return createInternalTicket(
        db,
        {
          objectId,
          title: undefined,
          description: undefined,
          priority: 'normal',
          faultTemplateKeys: [],
          ...input,
        },
        actorUserId,
      )
    }

    async function storedTicket(ticketId: string) {
      const [row] = await db
        .select()
        .from(schema.tickets)
        .where(eq(schema.tickets.id, ticketId))
        .limit(1)

      return row
    }

    it('keeps a backdated report time and starts the deadline there', async () => {
      const reportedAt = new Date(Date.now() - 20 * HOUR)
      const created = await createTicket({ reportedAt: reportedAt.toISOString() })
      const row = await storedTicket(created.ticketId)

      expect(row?.reportedAt.toISOString()).toBe(reportedAt.toISOString())
      expect(Math.abs((row?.receivedAt.getTime() ?? 0) - Date.now())).toBeLessThan(10_000)
      expect(row?.deadlineAt.toISOString()).toBe(
        new Date(reportedAt.getTime() + 72 * HOUR).toISOString(),
      )
    })

    it('rejects a report time in the future', async () => {
      const future = new Date(Date.now() + HOUR)

      await expect(
        createTicket({ reportedAt: future.toISOString() }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_request' })
    })

    it('requires an active user for an internal reporter', async () => {
      await expect(createTicket({ reporterKind: 'internal' })).rejects.toMatchObject({
        statusCode: 422,
        code: 'reporter_user_not_found',
      })
    })

    it('fills name and e-mail from the selected internal reporter', async () => {
      const created = await createTicket({
        reporterKind: 'internal',
        reportedByUserId: reporterUserId,
        reporterChannel: 'phone',
      })
      const row = await storedTicket(created.ticketId)

      expect(row?.reporterKind).toBe('internal')
      expect(row?.reporterChannel).toBe('phone')
      expect(row?.reportedByUserId).toBe(reporterUserId)
      expect(row?.reporterName).toBe('Rita Ruf')
      expect(row?.reporterEmail).toBe(
        (await db
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, reporterUserId)))[0]?.email,
      )
    })

    it('keeps an external reporter free of a user link', async () => {
      const created = await createTicket({
        reporterKind: 'external',
        reporterChannel: 'email',
        contact: { name: 'Erika Extern', phone: undefined, email: 'erika@example.invalid' },
      })
      const row = await storedTicket(created.ticketId)

      expect(row?.reporterKind).toBe('external')
      expect(row?.reportedByUserId).toBeNull()
      expect(row?.reporterName).toBe('Erika Extern')
    })
  },
)
