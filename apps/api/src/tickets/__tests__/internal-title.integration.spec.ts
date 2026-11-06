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

  async function storedTitle() {
    const rows = await db
      .select({ title: schema.tickets.title })
      .from(schema.tickets)
      .where(eq(schema.tickets.objectId, objectId))

    return rows[rows.length - 1]?.title ?? null
  }

  it('drops the title when the branding row is missing', async () => {
    await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle()).toBeNull()
  })

  it('drops the title when titleEnabled is false', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: '', titleEnabled: false, logo: '' },
    })
    await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle()).toBeNull()
  })

  it('keeps the title when titleEnabled is true', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: 'Switch GmbH', titleEnabled: true, logo: '' },
    })
    await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle()).toBe('Rauchmelder 2. OG')
  })

  it('drops the title when titleEnabled is malformed', async () => {
    await db.insert(schema.settings).values({
      key: 'branding',
      value: { companyName: '', titleEnabled: 'yes', logo: '' },
    })
    await createTicket('Rauchmelder 2. OG')
    expect(await storedTitle()).toBeNull()
  })
})
