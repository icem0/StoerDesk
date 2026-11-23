import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { readEscalationConfig, writeEscalationConfig } from '../config'
import { resolveAssigneePool } from '../assignee-pool'

/**
 * The assignee pool (`specs/07-escalation.md` §7.14, ADR-0039, WP-M19-03): the
 * ordered list of active users the office assigns a ticket to. The order of the
 * list is the order of the refusal chain; a deactivated user is refused.
 */

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped assignee pool integration: ${testDatabase.reason}\n`)
}

const { users } = schema

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

describe.skipIf(testDatabase.status === 'unavailable')('the assignee pool (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 2 })
  const db = drizzle(client, { schema })

  let firstUserId = ''
  let secondUserId = ''
  let inactiveUserId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })

    const inserted = await db
      .insert(users)
      .values([
        {
          email: `pool-first-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Pool',
          familyName: 'First',
        },
        {
          email: `pool-second-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Pool',
          familyName: 'Second',
        },
        {
          email: `pool-inactive-${randomUUID()}@example.invalid`,
          passwordHash: 'unused',
          givenName: 'Pool',
          familyName: 'Inactive',
          active: false,
        },
      ])
      .returning({ id: users.id })

    firstUserId = onlyRow(inserted.slice(0, 1), 'first user').id
    secondUserId = onlyRow(inserted.slice(1, 2), 'second user').id
    inactiveUserId = onlyRow(inserted.slice(2, 3), 'inactive user').id
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('writes the pool, reads it back in the order of the list', async () => {
    const written = await writeEscalationConfig(db, {
      rules: [],
      assigneePool: [secondUserId, firstUserId],
    })

    expect(written.assigneePool.map((member) => member.id)).toEqual([secondUserId, firstUserId])
    expect(written.assigneePool.map((member) => member.name)).toEqual(['Pool Second', 'Pool First'])

    expect(await resolveAssigneePool(db)).toEqual([secondUserId, firstUserId])
  })

  it('refuses a deactivated user with 400 invalid_assignee', async () => {
    await expect(
      writeEscalationConfig(db, { rules: [], assigneePool: [inactiveUserId] }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_assignee' })
  })

  it('refuses a duplicate id', async () => {
    await expect(
      writeEscalationConfig(db, { rules: [], assigneePool: [firstUserId, firstUserId] }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_assignee' })
  })

  it('keeps the pool when the body names no pool', async () => {
    const config = await readEscalationConfig(db)
    expect(config.assigneePool.map((member) => member.id)).toEqual([secondUserId, firstUserId])

    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, firstUserId))
      .limit(1)
    expect(row?.id).toBe(firstUserId)
  })
})
