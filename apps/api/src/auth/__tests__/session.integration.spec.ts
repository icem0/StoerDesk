import { count, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../db/schema'
import { seedRbac } from '../../db/seed-rbac'
import { migrationsFolder, openTestDatabase } from '../../db/__tests__/helpers/testDatabase'
import { hashPassword } from '../password'
import {
  createSession,
  destroySession,
  generateSessionToken,
  hashSessionToken,
  loadSession,
  loadUserRoleKeys,
} from '../session'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped session integration: ${testDatabase.reason}\n`)
}

const { roles, sessions, userRoles, users } = schema

type Db = PostgresJsDatabase<typeof schema>

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

async function sessionCount(db: Db, tokenHash: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))

  return Number(onlyRow(rows, 'session count').value)
}

describe.skipIf(testDatabase.status === 'unavailable')('session core (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema })

  let userId = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)

    const inserted = await db
      .insert(users)
      .values({
        email: 'session@example.org',
        passwordHash: await hashPassword('a-session-password'),
      })
      .returning({ id: users.id })

    userId = onlyRow(inserted, 'session user').id

    const [adminRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'admin'))

    if (adminRole === undefined) {
      throw new Error('expected the seeded admin role')
    }

    await db.insert(userRoles).values({ userId, roleId: adminRole.id })
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('stores only the hash of a new token and resolves it back to the user', async () => {
    const session = await createSession(db, userId, 72)

    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 60 * 60 * 1000)

    const stored = onlyRow(
      await db
        .select({ tokenHash: sessions.tokenHash, userId: sessions.userId })
        .from(sessions)
        .where(eq(sessions.userId, userId)),
      'session row',
    )

    expect(stored.tokenHash).toBe(hashSessionToken(session.token))
    expect(stored.tokenHash).not.toBe(session.token)
    expect(await loadSession(db, session.token)).toEqual({
      id: userId,
      email: 'session@example.org',
      locale: 'de',
    })
  })

  it('rejects an unknown token', async () => {
    expect(await loadSession(db, generateSessionToken())).toBeUndefined()
    expect(await loadSession(db, '')).toBeUndefined()
  })

  it('drops an expired row on read instead of accepting it', async () => {
    const token = 'an-expired-session-token'

    await db.insert(sessions).values({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() - 60 * 1000),
    })

    expect(await sessionCount(db, hashSessionToken(token))).toBe(1)
    expect(await loadSession(db, token)).toBeUndefined()
    expect(await sessionCount(db, hashSessionToken(token))).toBe(0)
  })

  it('logs out by deleting the session row', async () => {
    const session = await createSession(db, userId, 1)

    expect(await sessionCount(db, hashSessionToken(session.token))).toBe(1)

    await destroySession(db, session.token)

    expect(await sessionCount(db, hashSessionToken(session.token))).toBe(0)
    expect(await loadSession(db, session.token)).toBeUndefined()

    await destroySession(db, session.token)
    await destroySession(db, '')
  })

  it('treats a deactivated account as no session', async () => {
    const session = await createSession(db, userId, 1)

    expect(await loadSession(db, session.token)).toBeDefined()

    try {
      await db.update(users).set({ active: false }).where(eq(users.id, userId))

      expect(await loadSession(db, session.token)).toBeUndefined()
    } finally {
      await db.update(users).set({ active: true }).where(eq(users.id, userId))
    }

    expect(await loadSession(db, session.token)).toBeDefined()

    await destroySession(db, session.token)
  })

  it('reads the role keys of the user for every request', async () => {
    expect(await loadUserRoleKeys(db, userId)).toEqual(['admin'])
    expect(await loadUserRoleKeys(db, '00000000-0000-4000-8000-000000000000')).toEqual([])
  })
})
