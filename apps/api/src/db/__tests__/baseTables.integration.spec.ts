import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { groups, sessions, settings, userGroups, users } from '../schema'
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
async function expectPgError(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    const pgError = error instanceof PostgresError ? error : (error as { cause?: unknown }).cause

    expect(pgError).toBeInstanceOf(PostgresError)
    expect((pgError as PostgresError).code).toBe(code)

    return
  }

  throw new Error(`expected postgres error ${code}`)
}

describe.skipIf(testDatabase.status === 'unavailable')('base tables (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema: { users, sessions, groups, userGroups, settings } })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  const newEmail = () => `tech-${randomUUID()}@example.org`
  const newHash = () => `argon2-placeholder-${randomUUID()}`

  it('creates the uuid v7 function on the empty database', async () => {
    const rows = await client<
      { first_id: string; second_id: string }[]
    >`select gen_uuid_v7() as first_id,
        gen_uuid_v7() as second_id`
    const row = onlyRow(rows, 'function result')
    const first = String(row.first_id).replaceAll('-', '')
    const second = String(row.second_id).replaceAll('-', '')

    expect(first).toHaveLength(32)
    expect(first.charAt(12)).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(first.charAt(16))
    expect(second.slice(0, 12) >= first.slice(0, 12)).toBe(true)
  })

  it('inserts and reads back a user', async () => {
    const email = newEmail()
    const passwordHash = newHash()
    const inserted = onlyRow(
      await db.insert(users).values({ email, passwordHash }).returning(),
      'user',
    )

    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(inserted.createdAt).toBeInstanceOf(Date)
    expect(inserted.updatedAt).toBeInstanceOf(Date)

    const found = await db.query.users.findFirst({ where: eq(users.id, inserted.id) })

    expect(found?.email).toBe(email)
    expect(found?.passwordHash).toBe(passwordHash)
    expect(found?.locale).toBe('de')
    expect(found?.active).toBe(true)
  })

  it('assigns time-ordered uuid v7 ids', async () => {
    const inserted = await db
      .insert(users)
      .values(Array.from({ length: 5 }, () => ({ email: newEmail(), passwordHash: newHash() })))
      .returning({ id: users.id })

    const prefixes = inserted.map((row) => row.id.replaceAll('-', '').slice(0, 12))

    expect(inserted).toHaveLength(5)
    expect([...prefixes].sort()).toEqual(prefixes)
  })

  it('rejects duplicate e-mails and unsupported locales', async () => {
    const email = newEmail()

    await db.insert(users).values({ email, passwordHash: newHash() })

    await expectPgError('23505', () => db.insert(users).values({ email, passwordHash: newHash() }))
    await expectPgError('23514', () =>
      db.insert(users).values({ email: newEmail(), passwordHash: newHash(), locale: 'fr' }),
    )
  })

  it('cascades sessions and group memberships when a user is removed', async () => {
    const user = onlyRow(
      await db
        .insert(users)
        .values({ email: newEmail(), passwordHash: newHash() })
        .returning({ id: users.id }),
      'user',
    )
    const group = onlyRow(
      await db
        .insert(groups)
        .values({ name: `Group ${randomUUID()}` })
        .returning({ id: groups.id }),
      'group',
    )

    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: `token-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    await db.insert(userGroups).values({ userId: user.id, groupId: group.id })

    await db.delete(users).where(eq(users.id, user.id))

    const remainingSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id))
    const remainingMemberships = await db
      .select({ userId: userGroups.userId })
      .from(userGroups)
      .where(and(eq(userGroups.userId, user.id), eq(userGroups.groupId, group.id)))

    expect(remainingSessions).toHaveLength(0)
    expect(remainingMemberships).toHaveLength(0)

    await db.delete(groups).where(eq(groups.id, group.id))
  })

  it('stores settings as jsonb keyed by name', async () => {
    const key = `reportForm.${randomUUID()}`
    const value = { enabled: true, maxBodyLength: 2000 }

    await db.insert(settings).values({ key, value })

    const row = onlyRow(
      await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)),
      'setting',
    )

    expect(row.value).toEqual(value)

    await db.delete(settings).where(eq(settings.key, key))
  })
})
