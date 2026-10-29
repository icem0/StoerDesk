import { eq } from 'drizzle-orm'

import { hashPassword } from '../auth/password'
import { loadDotEnvFile, loadEnv } from '../config/env'
import { createDatabase, type Database } from './client'
import * as schema from './schema'

/** Bootstrap credentials, taken from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. */
export type SeedAdminCredentials = {
  email: string
  password: string
}

export type BaseSeedStatus = 'created' | 'existing' | 'skipped'

export type BaseSeedResult = {
  status: BaseSeedStatus
}

type RbacDatabase = Database['database']

/** The e-mail is stored normalized so the unique index cannot be bypassed. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Idempotent bootstrap of the first administrator (`specs/01-rbac.md` §3.1).
 *
 * The user is inserted once and keeps its `password_hash`, `locale` and `active`
 * values afterwards, so re-running the seed never resets a changed password and
 * never re-enables a deliberately deactivated account. Only the link to the system
 * role `admin` is ensured again. Requires `seed-rbac.ts` to have run first.
 */
export async function seedBaseUser(
  database: RbacDatabase,
  credentials: SeedAdminCredentials,
): Promise<BaseSeedResult> {
  const email = normalizeEmail(credentials.email)
  const password = credentials.password

  if (email === '' || password === '') {
    return { status: 'skipped' }
  }

  return database.transaction(async (tx) => {
    const roleRows = await tx
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.key, 'admin'))

    const [adminRole] = roleRows

    if (adminRole === undefined) {
      throw new Error('seed-base: rbac_seed_missing')
    }

    const inserted = await tx
      .insert(schema.users)
      .values({ email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id })

    const [user] =
      inserted.length === 1
        ? inserted
        : await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, email))
            .limit(1)

    if (user === undefined) {
      throw new Error('seed-base: bootstrap_user_missing')
    }

    await tx
      .insert(schema.userRoles)
      .values({ userId: user.id, roleId: adminRole.id })
      .onConflictDoNothing()

    return { status: inserted.length === 1 ? 'created' : 'existing' }
  })
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed-base.ts') === true ||
  process.argv[1]?.endsWith('seed-base.js') === true

if (invokedDirectly) {
  loadDotEnvFile()

  const env = loadEnv()
  const { client, database } = createDatabase()

  try {
    const result = await seedBaseUser(database, {
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    })

    // No e-mail and no password in the output: seed credentials are not log data.
    process.stdout.write(`${JSON.stringify({ seed: 'base', status: result.status })}\n`)
  } finally {
    await client.end()
  }
}
