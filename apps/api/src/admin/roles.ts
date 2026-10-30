import { count, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createRoleRequestSchema,
  isPermissionKey,
  PERMISSIONS,
  roleKeySchema,
  roleListResponseSchema,
  roleSummarySchema,
  SYSTEM_ROLE_KEYS,
  updateRoleRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { permissions, rolePermissions, roles, userRoles } from '../db/schema'

/**
 * Admin role API (`specs/01-rbac.md` §3.8): the only runtime path that creates or
 * changes roles. Seeded system roles keep their grants from `seed-rbac.ts`, so the
 * service-level guards of §3.5 refuse every write against them; the
 * `protect_system_roles` trigger of migration 0001 stays the backstop.
 */

type Transaction = Parameters<Parameters<Database['database']['transaction']>[0]>[0]

type RoleRow = {
  id: string
  key: string
  isSystem: boolean
}

class RoleRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'RoleRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } }
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function isSystemRoleKey(key: string): boolean {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  )
}

function summarize(row: RoleRow, permissionKeys: string[], userCount: number) {
  return roleSummarySchema.parse({
    ...row,
    permissionKeys: [...permissionKeys].sort(),
    userCount,
  })
}

async function countUsers(database: Transaction, roleId: string): Promise<number> {
  const rows = await database
    .select({ value: count() })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId))

  return Number(rows[0]?.value ?? 0)
}

async function loadGrantKeys(database: Transaction, roleId: string): Promise<string[]> {
  const rows = await database
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId))

  return rows.map((row) => row.key).sort()
}

/** Catalog check first (§3.4), then the ids — unknown keys never reach a write. */
async function loadPermissionIds(
  database: Transaction,
  permissionKeys: string[],
): Promise<string[]> {
  const unknown = permissionKeys.filter((key) => !isPermissionKey(key)).sort()

  if (unknown.length > 0) {
    throw new RoleRouteError(422, 'unknown_permission_key', {
      fields: ['permissionKeys'],
      permissionKeys: unknown,
    })
  }

  if (permissionKeys.length === 0) {
    return []
  }

  const rows = await database
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, permissionKeys))

  const found = new Set(rows.map((row) => row.key))
  const missing = permissionKeys.filter((key) => found.has(key) === false).sort()

  if (missing.length > 0) {
    throw new RoleRouteError(422, 'unknown_permission_key', {
      fields: ['permissionKeys'],
      permissionKeys: missing,
    })
  }

  return rows.map((row) => row.id)
}

async function replaceGrants(
  database: Transaction,
  roleId: string,
  permissionKeys: string[],
): Promise<void> {
  const permissionIds = await loadPermissionIds(database, permissionKeys)

  await database.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))

  if (permissionIds.length > 0) {
    await database
      .insert(rolePermissions)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
  }
}

async function findRole(database: Transaction, key: string): Promise<RoleRow> {
  const rows = await database
    .select({ id: roles.id, key: roles.key, isSystem: roles.isSystem })
    .from(roles)
    .where(eq(roles.key, key))
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    throw new RoleRouteError(404, 'role_not_found', { fields: ['key'] })
  }

  return row
}

function parseRoleKey(raw: string) {
  return roleKeySchema.safeParse(raw)
}

export type AdminRolesRouteOptions = {
  database: Database['database']
}

export const adminRolesRoutes = fp<AdminRolesRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/roles',
      { preHandler: requirePermission(database, PERMISSIONS.role.read) },
      async () => {
        const roleRows = await database
          .select({ id: roles.id, key: roles.key, isSystem: roles.isSystem })
          .from(roles)
          .orderBy(roles.key)

        const grantRows = await database
          .select({ roleId: rolePermissions.roleId, key: permissions.key })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))

        const userCountRows = await database
          .select({ roleId: userRoles.roleId, value: count() })
          .from(userRoles)
          .groupBy(userRoles.roleId)

        const grantKeysByRole = new Map<string, string[]>()

        for (const row of grantRows) {
          const existing = grantKeysByRole.get(row.roleId) ?? []
          existing.push(row.key)
          grantKeysByRole.set(row.roleId, existing)
        }

        const userCounts = new Map(
          userCountRows.map((row) => [row.roleId, Number(row.value) as number]),
        )

        return roleListResponseSchema.parse({
          roles: roleRows.map((row) =>
            summarize(row, (grantKeysByRole.get(row.id) ?? []).sort(), userCounts.get(row.id) ?? 0),
          ),
        })
      },
    )

    app.post(
      '/api/v1/roles',
      { preHandler: requirePermission(database, PERMISSIONS.role.write) },
      async (request, reply) => {
        const parsed = createRoleRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        const { key, permissionKeys } = parsed.data

        if (isSystemRoleKey(key)) {
          return reply.code(409).send({ code: 'role_key_taken', params: { fields: ['key'] } })
        }

        const existing = await database
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.key, key))
          .limit(1)

        if (existing.length > 0) {
          return reply.code(409).send({ code: 'role_key_taken', params: { fields: ['key'] } })
        }

        const created = await database
          .transaction(async (tx) => {
            const permissionIds = await loadPermissionIds(tx, permissionKeys)
            const inserted = await tx
              .insert(roles)
              .values({ key, isSystem: false })
              .returning({ id: roles.id, key: roles.key, isSystem: roles.isSystem })

            const [row] = inserted

            if (row === undefined) {
              throw new RoleRouteError(500, 'role_create_failed', { fields: ['key'] })
            }

            if (permissionIds.length > 0) {
              await tx
                .insert(rolePermissions)
                .values(permissionIds.map((permissionId) => ({ roleId: row.id, permissionId })))
            }

            return row
          })
          // A parallel create of the same key: the unique index decides, not the probe.
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) {
              throw new RoleRouteError(409, 'role_key_taken', { fields: ['key'] })
            }

            throw error
          })

        return reply.code(201).send(summarize(created, permissionKeys, 0))
      },
    )

    app.patch<{ Params: { key: string } }>(
      '/api/v1/roles/:key',
      { preHandler: requirePermission(database, PERMISSIONS.role.write) },
      async (request, reply) => {
        const parsedKey = parseRoleKey(request.params.key)

        if (!parsedKey.success) {
          return reply.code(400).send(invalidRequest(['key']))
        }

        const parsed = updateRoleRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        const updated = await database.transaction(async (tx) => {
          const role = await findRole(tx, parsedKey.data)

          if (role.isSystem) {
            throw new RoleRouteError(409, 'system_role_protected', { fields: ['key'] })
          }

          let permissionKeys = await loadGrantKeys(tx, role.id)

          if (parsed.data.permissionKeys !== undefined) {
            await replaceGrants(tx, role.id, parsed.data.permissionKeys)
            permissionKeys = parsed.data.permissionKeys
          }

          await tx.update(roles).set({ updatedAt: new Date() }).where(eq(roles.id, role.id))

          return summarize(role, permissionKeys, await countUsers(tx, role.id))
        })

        return reply.code(200).send(updated)
      },
    )

    app.delete<{ Params: { key: string } }>(
      '/api/v1/roles/:key',
      { preHandler: requirePermission(database, PERMISSIONS.role.write) },
      async (request, reply) => {
        const parsedKey = parseRoleKey(request.params.key)

        if (!parsedKey.success) {
          return reply.code(400).send(invalidRequest(['key']))
        }

        await database.transaction(async (tx) => {
          const role = await findRole(tx, parsedKey.data)

          if (role.isSystem) {
            throw new RoleRouteError(409, 'system_role_protected', { fields: ['key'] })
          }

          const userCount = await countUsers(tx, role.id)

          if (userCount > 0) {
            // Assignments are never dropped silently (§3.8).
            throw new RoleRouteError(409, 'role_in_use', { fields: ['key'], userCount })
          }

          await tx.delete(roles).where(eq(roles.id, role.id))
        })

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-admin-roles' },
)
