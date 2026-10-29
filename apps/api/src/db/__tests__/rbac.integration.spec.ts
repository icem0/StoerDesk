import { randomUUID } from 'node:crypto'

import { and, count, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { PostgresError } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_ROLES, PERMISSION_KEYS, SYSTEM_ROLE_KEYS } from '@stoerdesk/shared'

import * as schema from '../schema'
import { seedRbac } from '../seed-rbac'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped rbac integration: ${testDatabase.reason}\n`)
}

const { permissions, rolePermissions, roles, userPermissions, users } = schema

type Db = PostgresJsDatabase<typeof schema>

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

async function countGrants(db: Db): Promise<number> {
  const rows = await db.select({ value: count() }).from(rolePermissions)

  return Number(onlyRow(rows, 'grant count').value)
}

async function countRoles(db: Db): Promise<number> {
  const rows = await db.select({ value: count() }).from(roles)

  return Number(onlyRow(rows, 'role count').value)
}

async function idOfRole(db: Db, key: string): Promise<string> {
  return onlyRow(
    await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)),
    `role ${key}`,
  ).id
}

async function idOfPermission(db: Db, key: string): Promise<string> {
  return onlyRow(
    await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.key, key)),
    `permission ${key}`,
  ).id
}

async function grantKeysOf(db: Db, roleKey: string): Promise<string[]> {
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .where(eq(roles.key, roleKey))

  return rows.map((row) => row.key).sort()
}

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

describe.skipIf(testDatabase.status === 'unavailable')('rbac tables and seed (integration)', () => {
  const url = testDatabase.status === 'available' ? testDatabase.url : ''
  const client = postgres(url, { max: 4 })
  const db = drizzle(client, { schema })

  beforeAll(async () => {
    await migrate(db, { migrationsFolder })
    await seedRbac(db)
  })

  afterAll(async () => {
    await client.end({ timeout: 2 })

    if (testDatabase.status === 'available') {
      await testDatabase.close()
    }
  })

  it('creates the catalog and the five system roles', async () => {
    const permissionCount = onlyRow(
      await db.select({ value: count() }).from(permissions),
      'permission count',
    )
    const seeded = await db
      .select({ key: roles.key, isSystem: roles.isSystem })
      .from(roles)
      .orderBy(roles.key)

    expect(Number(permissionCount.value)).toBe(PERMISSION_KEYS.length)
    expect(seeded.map((row) => row.key)).toEqual([...SYSTEM_ROLE_KEYS].sort())
    expect(seeded.every((row) => row.isSystem)).toBe(true)
  })

  it('grants exactly the permission set of every default role', async () => {
    for (const roleKey of SYSTEM_ROLE_KEYS) {
      await expect(grantKeysOf(db, roleKey)).resolves.toEqual([...DEFAULT_ROLES[roleKey]].sort())
    }
  })

  it('holds every catalog permission in admin', async () => {
    const granted = await grantKeysOf(db, 'admin')

    expect(granted).toHaveLength(PERMISSION_KEYS.length)
    expect([...PERMISSION_KEYS].sort()).toEqual(granted)
  })

  it('is idempotent and repairs a removed grant', async () => {
    const before = await countGrants(db)
    const office = await idOfRole(db, 'office')
    const review = await idOfPermission(db, 'ticket.review')

    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, office), eq(rolePermissions.permissionId, review)))

    await seedRbac(db)

    expect(await countGrants(db)).toBe(before)
    await expect(grantKeysOf(db, 'office')).resolves.toEqual([...DEFAULT_ROLES.office].sort())
  })

  it('keeps custom roles untouched by the seed', async () => {
    const custom = onlyRow(
      await db
        .insert(roles)
        .values({ key: 'dispatch_lead', isSystem: false })
        .returning({ id: roles.id }),
      'custom role',
    )

    await db.insert(rolePermissions).values({
      roleId: custom.id,
      permissionId: await idOfPermission(db, 'stats.read'),
    })

    await seedRbac(db)

    expect(await grantKeysOf(db, 'dispatch_lead')).toEqual(['stats.read'])
    expect(await countRoles(db)).toBe(SYSTEM_ROLE_KEYS.length + 1)

    await db.delete(roles).where(eq(roles.id, custom.id))

    expect(
      await db
        .select({ roleId: rolePermissions.roleId })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, custom.id)),
    ).toHaveLength(0)
  })

  it('protects system roles against DELETE', async () => {
    await expectPgError('P0001', () => db.delete(roles).where(eq(roles.key, 'admin')))
    await expectPgError('P0001', () => db.delete(roles))

    expect(await countRoles(db)).toBe(SYSTEM_ROLE_KEYS.length)
  })

  it('stores explicit per-user overrides and rejects unknown effects', async () => {
    const user = onlyRow(
      await db
        .insert(users)
        .values({
          email: `override-${randomUUID()}@example.org`,
          passwordHash: 'argon2-placeholder',
        })
        .returning({ id: users.id }),
      'user',
    )

    await db.insert(userPermissions).values([
      {
        userId: user.id,
        permissionId: await idOfPermission(db, 'ticket.close'),
        effect: 'deny',
      },
      {
        userId: user.id,
        permissionId: await idOfPermission(db, 'stats.read'),
        effect: 'allow',
      },
    ])

    const stored = await db
      .select({ key: permissions.key, effect: userPermissions.effect })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(eq(userPermissions.userId, user.id))

    expect(stored.map((row) => `${row.effect}:${row.key}`).sort()).toEqual([
      'allow:stats.read',
      'deny:ticket.close',
    ])

    const oncallRead = await idOfPermission(db, 'oncall.read')

    await expectPgError('23514', () =>
      db
        .insert(userPermissions)
        .values({ userId: user.id, permissionId: oncallRead, effect: 'maybe' }),
    )

    await db.delete(users).where(eq(users.id, user.id))

    expect(
      await db
        .select({ userId: userPermissions.userId })
        .from(userPermissions)
        .where(eq(userPermissions.userId, user.id)),
    ).toHaveLength(0)
  })
})
