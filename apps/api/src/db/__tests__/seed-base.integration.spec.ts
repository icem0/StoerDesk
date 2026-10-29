import { count, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { verifyPassword } from '../../auth/password'
import * as schema from '../schema'
import { seedBaseUser } from '../seed-base'
import { seedRbac } from '../seed-rbac'
import { migrationsFolder, openTestDatabase } from './helpers/testDatabase'

const testDatabase = await openTestDatabase()

if (testDatabase.status === 'unavailable') {
  process.stderr.write(`skipped base seed integration: ${testDatabase.reason}\n`)
}

const { roles, userRoles, users } = schema

const credentials = {
  email: 'Seed-Admin@Example.org',
  password: 'bootstrap-admin-password',
}

type Db = PostgresJsDatabase<typeof schema>

function onlyRow<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`expected one ${what}`)
  }

  return row
}

async function countUsers(db: Db): Promise<number> {
  const rows = await db.select({ value: count() }).from(users)

  return Number(onlyRow(rows, 'user count').value)
}

describe.skipIf(testDatabase.status === 'unavailable')(
  'base seed — bootstrap administrator (integration)',
  () => {
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

    it('creates one active bootstrap user with an Argon2id hash and a lower case e-mail', async () => {
      const seeded = await seedBaseUser(db, credentials)

      expect(seeded.status).toBe('created')

      const user = onlyRow(
        await db
          .select({
            email: users.email,
            passwordHash: users.passwordHash,
            locale: users.locale,
            active: users.active,
          })
          .from(users),
        'bootstrap user',
      )

      expect(user.email).toBe('seed-admin@example.org')
      expect(user.active).toBe(true)
      expect(user.locale).toBe('de')
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true)
      expect(await verifyPassword(user.passwordHash, credentials.password)).toBe(true)
      expect(await countUsers(db)).toBe(1)
    })

    it('links the bootstrap user to the system role admin', async () => {
      const linked = await db
        .select({ key: roles.key, isSystem: roles.isSystem })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(eq(users.email, 'seed-admin@example.org'))

      expect(linked).toHaveLength(1)
      expect(onlyRow(linked, 'role link').key).toBe('admin')
      expect(onlyRow(linked, 'role link').isSystem).toBe(true)
    })

    it('keeps a changed password hash on the second run and re-creates only the role link', async () => {
      const userId = onlyRow(await db.select({ id: users.id }).from(users), 'user').id

      await db
        .update(users)
        .set({ passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$manual$manual', locale: 'en' })
        .where(eq(users.email, 'seed-admin@example.org'))
      await db.delete(userRoles).where(eq(userRoles.userId, userId))

      const second = await seedBaseUser(db, {
        email: credentials.email,
        password: 'a-completely-different-password',
      })

      expect(second.status).toBe('existing')
      expect(await countUsers(db)).toBe(1)

      const user = onlyRow(
        await db.select({ passwordHash: users.passwordHash, locale: users.locale }).from(users),
        'bootstrap user',
      )

      expect(user.passwordHash).toBe('$argon2id$v=19$m=65536,t=3,p=4$manual$manual')
      expect(user.locale).toBe('en')

      const link = await db
        .select({ key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))

      expect(onlyRow(link, 'restored role link').key).toBe('admin')
    })

    it('skips the seed when a seed credential is empty', async () => {
      const skipped = await seedBaseUser(db, { email: credentials.email, password: '' })
      const alsoSkipped = await seedBaseUser(db, { email: '   ', password: credentials.password })

      expect(skipped.status).toBe('skipped')
      expect(alsoSkipped.status).toBe('skipped')
      expect(await countUsers(db)).toBe(1)
    })

    it('fails with rbac_seed_missing while the admin role is missing', async () => {
      await db.update(roles).set({ key: 'admin_deferred' }).where(eq(roles.key, 'admin'))

      try {
        await expect(seedBaseUser(db, credentials)).rejects.toThrow('rbac_seed_missing')
      } finally {
        await db.update(roles).set({ key: 'admin' }).where(eq(roles.key, 'admin_deferred'))
      }
    })
  },
)
