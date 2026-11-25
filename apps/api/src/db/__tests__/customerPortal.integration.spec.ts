import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { accountTokens, objectAssignments, objects, tickets, users } from '../schema'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped db integration: ${testDatabase.reason}\n`)
}

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

/** Drizzle wraps driver errors, so the Postgres error may sit in `cause`. */
function causeOf(error: unknown): unknown {
  return error instanceof PostgresError ? error : (error as { cause?: unknown }).cause
}

async function expectPgError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const pgError = causeOf(error)

    expect(pgError).toBeInstanceOf(PostgresError)
    expect((pgError as PostgresError).code).toBe(code)

    return
  }

  throw new Error(`expected postgres error ${code}`)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'the tables of the customer portal (integration)',
  () => {
    const url = testDatabase.status === 'available' ? testDatabase.url : ''
    const client = postgres(url, { max: 8 })
    const db = drizzle(client, {
      schema: { accountTokens, objectAssignments, objects, tickets, users },
    })

    beforeAll(async () => {
      await migrate(db, { migrationsFolder })
    })

    afterAll(async () => {
      await client.end({ timeout: 2 })

      if (testDatabase.status === 'available') {
        await testDatabase.close()
      }
    })

    async function newUser(values: Record<string, unknown> = {}): Promise<string> {
      const [user] = await db
        .insert(users)
        .values({
          email: `${randomUUID()}@beispiel.org`,
          givenName: 'Erika',
          familyName: 'Mustermann',
          passwordHash: 'not-a-hash',
          ...values,
        })
        .returning({ id: users.id })

      return onlyRow(user ? [user] : [], 'user').id
    }

    async function newObject(): Promise<string> {
      const [object] = await db
        .insert(objects)
        .values({
          objectNo: `9${randomUUID().slice(0, 5)}_31`,
          name: `Objekt ${randomUUID()}`,
        })
        .returning({ id: objects.id })

      return onlyRow(object ? [object] : [], 'object').id
    }

    it('keeps the trained person of an object unique', async () => {
      const objectId = await newObject()
      const userId = await newUser()

      await db.insert(objectAssignments).values({ objectId, userId })

      await expectPgError('23505', async () => {
        await db.insert(objectAssignments).values({ objectId, userId })
      })

      const rows = await db.select().from(objectAssignments)

      expect(rows.filter((row) => row.objectId === objectId)).toHaveLength(1)
    })

    it('knows only the two purposes of a token and one address per token', async () => {
      const userId = await newUser()
      const tokenHash = randomUUID()

      await db.insert(accountTokens).values({
        userId,
        purpose: 'registration',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      })

      await expectPgError('23505', async () => {
        await db.insert(accountTokens).values({
          userId,
          purpose: 'password_reset',
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        })
      })

      await expectPgError('23514', async () => {
        await db.insert(accountTokens).values({
          userId,
          purpose: 'something_else',
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        })
      })
    })

    it('knows how an account came into existence', async () => {
      await expectPgError('23514', async () => {
        await db.insert(users).values({
          email: `${randomUUID()}@beispiel.org`,
          passwordHash: 'not-a-hash',
          createdVia: 'somewhere_else',
        })
      })

      const userId = await newUser({ createdVia: 'qr_registration' })

      const [row] = await db.select().from(users).where(eq(users.id, userId))

      expect(row?.createdVia).toBe('qr_registration')
    })

    it('keeps the ticket of a deleted customer and loses the customer', async () => {
      const objectId = await newObject()
      const customerId = await newUser({ createdVia: 'registration' })
      const [ticket] = await db
        .insert(tickets)
        .values({
          objectId,
          reportedAt: new Date(),
          deadlineAt: new Date(Date.now() + 3_600_000),
          customerUserId: customerId,
          customerEmailNotifications: true,
          trainedPersonConfirmed: true,
        })
        .returning({ id: tickets.id, customerUserId: tickets.customerUserId })

      expect(ticket?.customerUserId).toBe(customerId)

      await db.delete(users).where(eq(users.id, customerId))

      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket!.id))

      expect(row).toBeDefined()
      expect(row?.customerUserId).toBeNull()
      expect(row?.customerEmailNotifications).toBe(true)
      expect(row?.trainedPersonConfirmed).toBe(true)
    })
  },
)
