import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import * as schema from '../../db/schema'
import { createInternalTicket } from '../internal'
import { readDeadlineHours, deadlineAtForPriority } from '../deadline'
import { reportTimes } from '../report'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped deadline integration: ${testDatabase.reason}\n`)
}

const HOUR = 60 * 60 * 1000

describe.skipIf(testDatabase.status === 'unavailable')('ticket deadlines', () => {
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
        email: `deadline-${randomUUID()}@example.invalid`,
        passwordHash: 'not-used',
      })
      .returning({ id: schema.users.id })
    actorUserId = user?.id ?? ''

    const [object] = await db
      .insert(schema.objects)
      .values({ objectNo: `DL-${randomUUID().slice(0, 6)}`, name: 'Deadline probe' })
      .returning({ id: schema.objects.id })
    objectId = object?.id ?? ''
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('uses the ADR-0008 defaults and a settings override', async () => {
    expect(await readDeadlineHours(db)).toMatchObject({
      low: 168,
      normal: 72,
      high: 24,
      critical: 8,
    })

    await db.insert(schema.settings).values({
      key: 'ticket.deadline_hours.critical',
      value: 2,
    })

    const base = new Date('2026-11-05T08:00:00.000Z')

    expect((await deadlineAtForPriority(db, base, 'critical')).getTime()).toBe(
      base.getTime() + 2 * HOUR,
    )
    expect((await deadlineAtForPriority(db, base, 'normal')).getTime()).toBe(
      base.getTime() + 72 * HOUR,
    )
  })

  it('keeps the report at the normal deadline', () => {
    const times = reportTimes(
      {
        qrToken: 'a'.repeat(22),
        clientUuid: randomUUID(),
        text: 'probe',
        faultTemplateKeys: [],
        contact: { name: undefined, phone: '000' },
        locale: 'de',
        photos: [],
      },
      new Date('2026-11-05T08:00:00.000Z'),
    )

    expect(times.deadlineAt.getTime() - times.reportedAt.getTime()).toBe(72 * HOUR)
  })

  it('writes the per-priority deadline on internal creation', async () => {
    const created = await createInternalTicket(
      db,
      {
        objectId,
        title: 'critical probe',
        description: undefined,
        priority: 'critical',
        faultTemplateKeys: [],
      },
      actorUserId,
    )

    expect(new Date(created.deadlineAt).getTime() - new Date(created.reportedAt).getTime()).toBe(
      2 * HOUR,
    )
  })
})
