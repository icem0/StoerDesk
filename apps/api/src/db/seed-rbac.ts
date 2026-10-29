import { and, count, eq, notInArray } from 'drizzle-orm'

import {
  DEFAULT_ROLES,
  PERMISSION_KEYS,
  SYSTEM_ROLE_KEYS,
  type PermissionKey,
  type SystemRoleKey,
} from '@stoerdesk/shared'

import { loadDotEnvFile } from '../config/env'
import { createDatabase, type Database } from './client'
import * as schema from './schema'

export type RbacSeedResult = {
  roles: number
  permissions: number
  rolePermissions: number
}

type RbacDatabase = Database['database']

function onlyValue<T>(rows: T[], what: string): T {
  const [row] = rows

  if (!row) {
    throw new Error(`seed-rbac: expected one ${what}`)
  }

  return row
}

function requireId(ids: Map<string, string>, key: string, what: string): string {
  const id = ids.get(key)

  if (id === undefined) {
    throw new Error(`seed-rbac: missing ${what} ${key}`)
  }

  return id
}

/**
 * Idempotent seed of the RBAC catalog (`specs/01-rbac.md` §3.5).
 *
 * Permissions and the five system roles are upserted, and the permission set of
 * every system role is rewritten from `DEFAULT_ROLES`. Custom roles and all
 * `user_permissions` rows stay untouched, so running the seed twice changes
 * nothing.
 */
export async function seedRbac(database: RbacDatabase): Promise<RbacSeedResult> {
  return database.transaction(async (tx) => {
    for (const key of PERMISSION_KEYS) {
      await tx
        .insert(schema.permissions)
        .values({ key })
        .onConflictDoNothing({ target: schema.permissions.key })
    }

    for (const roleKey of SYSTEM_ROLE_KEYS) {
      await tx
        .insert(schema.roles)
        .values({ key: roleKey, isSystem: true })
        .onConflictDoUpdate({
          target: schema.roles.key,
          set: { isSystem: true, updatedAt: new Date() },
        })
    }

    const permissionRows = await tx
      .select({ id: schema.permissions.id, key: schema.permissions.key })
      .from(schema.permissions)
    const roleRows = await tx
      .select({ id: schema.roles.id, key: schema.roles.key })
      .from(schema.roles)

    const permissionIds = new Map(permissionRows.map((row) => [row.key, row.id]))
    const roleIds = new Map(roleRows.map((row) => [row.key, row.id]))

    for (const roleKey of SYSTEM_ROLE_KEYS) {
      const roleId = requireId(roleIds, roleKey, 'role')
      const wanted = wantedPermissionIds(roleKey, permissionIds)

      await tx
        .delete(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, roleId),
            notInArray(schema.rolePermissions.permissionId, wanted),
          ),
        )

      await tx
        .insert(schema.rolePermissions)
        .values(wanted.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing()
    }

    const [roleCount, permissionCount, rolePermissionCount] = await Promise.all([
      tx.select({ value: count() }).from(schema.roles),
      tx.select({ value: count() }).from(schema.permissions),
      tx.select({ value: count() }).from(schema.rolePermissions),
    ])

    return {
      roles: Number(onlyValue(roleCount, 'role count').value),
      permissions: Number(onlyValue(permissionCount, 'permission count').value),
      rolePermissions: Number(onlyValue(rolePermissionCount, 'role permission count').value),
    }
  })
}

function wantedPermissionIds(roleKey: SystemRoleKey, permissionIds: Map<string, string>): string[] {
  return DEFAULT_ROLES[roleKey].map((key: PermissionKey) =>
    requireId(permissionIds, key, 'permission'),
  )
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed-rbac.ts') === true ||
  process.argv[1]?.endsWith('seed-rbac.js') === true

if (invokedDirectly) {
  loadDotEnvFile()

  const { client, database } = createDatabase()

  try {
    const result = await seedRbac(database)

    process.stdout.write(
      `${JSON.stringify({
        seed: 'rbac',
        roles: result.roles,
        permissions: result.permissions,
        rolePermissions: result.rolePermissions,
      })}\n`,
    )
  } finally {
    await client.end()
  }
}
