import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { getTicketDetail } from '../detail'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped ticket detail title gate integration: ${testDatabase.reason}\n`)
}

describe.skipIf(testDatabase.status === 'unavailable')('ticket detail title gate (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let objectId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const [object] = await db
      .insert(schema.objects)
      .values({ objectNo: `TG-${randomUUID().slice(0, 6)}`, name: 'Title gate probe' })
      .returning({ id: schema.objects.id })

    objectId = object?.id ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  async function insertTicket(title: string | null): Promise<string> {
    const [ticket] = await db
      .insert(schema.tickets)
      .values({
        objectId,
        status: 'NEW',
        priority: 'normal',
        reportedAt: new Date(),
        receivedAt: new Date(),
        deadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        faultTemplateKeys: [],
        title,
      })
      .returning({ ticketNo: schema.tickets.ticketNo })

    if (ticket === undefined) {
      throw new Error('ticket insert failed')
    }

    return ticket.ticketNo
  }

  async function writeBranding(titleEnabled: boolean): Promise<void> {
    await db
      .insert(schema.settings)
      .values({ key: 'branding', value: { companyName: 'Switch GmbH', titleEnabled, logo: '' } })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: { companyName: 'Switch GmbH', titleEnabled, logo: '' } },
      })
  }

  it('hides the stored title while the branding switch is off', async () => {
    const ticketNo = await insertTicket('Rauchmelder 2. OG')

    const result = await getTicketDetail(db, ticketNo)

    expect(result.ticket.title).toBeNull()
  })

  it('shows the stored title while the branding switch is on', async () => {
    const ticketNo = await insertTicket('Rauchmelder 2. OG')

    await writeBranding(true)

    const result = await getTicketDetail(db, ticketNo)

    expect(result.ticket.title).toBe('Rauchmelder 2. OG')
  })

  it('hides the title again after the switch is turned off (live switch)', async () => {
    const ticketNo = await insertTicket('Rauchmelder 2. OG')

    await writeBranding(true)
    await writeBranding(false)

    const result = await getTicketDetail(db, ticketNo)

    expect(result.ticket.title).toBeNull()
  })

  it('hides the title when the branding row is missing', async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, 'branding'))

    const ticketNo = await insertTicket('Rauchmelder 2. OG')

    const result = await getTicketDetail(db, ticketNo)

    expect(result.ticket.title).toBeNull()
  })
})
