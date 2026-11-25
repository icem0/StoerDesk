import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
import { createInternalTicket } from '../internal'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped internal-title integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')('internal ticket creation title', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let actorUserId = ''
  let objectId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `internal-title-${randomUUID()}@example.invalid`,
        passwordHash: 'not-used',
      })
      .returning({ id: schema.users.id })
    actorUserId = user?.id ?? ''

    const [object] = await db
      .insert(schema.objects)
      .values({ objectNo: `IT-${randomUUID().slice(0, 6)}`, name: 'Internal title probe' })
      .returning({ id: schema.objects.id })
    objectId = object?.id ?? ''
  })

  beforeEach(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, 'branding'))
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function createTicket(title?: string) {
    return createInternalTicket(
      db,
      {
        objectId,
        title,
        description: undefined,
        priority: 'normal',
        faultTemplateKeys: [],
      },
      actorUserId,
    )
  }

  /**
   * Reads the title of exactly the ticket the case created. The tickets of the
   * four cases share one object and stay in the table, so a read of "the last
   * row of the object" without an `ORDER BY` is not the ticket of this case and
   * made the suite flaky.
   */
  async function storedTitle(ticketId: string) {
    const [row] = await db
      .select({ title: schema.tickets.title })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .limit(1)

    return row?.title ?? null
  }

  it('drops the title when the branding row is missing', async () => {
    const ticket = await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle(ticket.ticketId)).toBeNull()
  })

  it('drops the title when titleEnabled is false', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: '', titleEnabled: false, logo: '' },
    })
    const ticket = await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle(ticket.ticketId)).toBeNull()
  })

  it('keeps the title when titleEnabled is true', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: 'Switch GmbH', titleEnabled: true, logo: '' },
    })
    const ticket = await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle(ticket.ticketId)).toBe('Rauchmelder 2. OG')
  })

  it('drops the title when titleEnabled is malformed', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: '', titleEnabled: 'yes', logo: '' },
    })
    const ticket = await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle(ticket.ticketId)).toBeNull()
  })
})
