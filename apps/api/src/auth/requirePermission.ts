import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import fp from 'fastify-plugin'
import { isPermissionKey, type PermissionKey } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { permissions, rolePermissions, roles, userPermissions, userRoles } from '../db/schema'

/**
 * Effective permissions and the only enforcement point of the API
 * (`specs/01-rbac.md` §3.2, §3.7).
 *
 * Rights are resolved per request, never stored in the session or in a cookie:
 * a role change or an explicit denial takes effect on the next request without
 * a new login. Within one request the resolution happens once — several guards
 * on the same route share the cached promise.
 */

type PermissionDatabase = Database['database']

declare module 'fastify' {
  interface FastifyRequest {
    /** Effective permission keys of this request, resolved at most once. */
    effectivePermissions?: Promise<PermissionKey[]>
  }
}

/**
 * Effective permission keys of a user: the union of the role permissions plus the
 * explicit `allow` rows, minus every key with an explicit `deny` row — a denial
 * always wins. Two queries, sorted catalog keys, never translated text.
 */
export async function loadEffectivePermissions(
  database: PermissionDatabase,
  userId: string,
): Promise<PermissionKey[]> {
  const granted = await database
    .selectDistinct({ key: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId))

  const overrides = await database
    .select({ key: permissions.key, effect: userPermissions.effect })
    .from(userPermissions)
    .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
    .where(eq(userPermissions.userId, userId))

  const denied = new Set(overrides.filter((row) => row.effect === 'deny').map((row) => row.key))
  const allowed = new Set([
    ...granted.map((row) => row.key),
    ...overrides.filter((row) => row.effect === 'allow').map((row) => row.key),
  ])

  return [...allowed]
    .filter((key) => denied.has(key) === false)
    .filter(isPermissionKey)
    .sort()
}

/** Same resolution as `loadEffectivePermissions`, cached on the request (§3.7). */
export function effectivePermissions(
  request: FastifyRequest,
  database: PermissionDatabase,
): Promise<PermissionKey[]> {
  const cached = request.effectivePermissions

  if (cached !== undefined) {
    return cached
  }

  // An anonymous request has no rights at all; the guards answer 401 before this
  // helper is ever reached, so the empty id only covers a direct call.
  const resolved = loadEffectivePermissions(database, request.user?.id ?? '')
  request.effectivePermissions = resolved

  return resolved
}

/**
 * The check behind every guard: `401` without a session (authentication before
 * authorization), `403 { code: 'forbidden' }` without a matching key. Keys are
 * OR-linked, an unknown key is never held.
 */
async function checkPermission(
  database: PermissionDatabase,
  keys: readonly PermissionKey[],
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user === undefined) {
    await reply.code(401).send({ code: 'session_invalid', params: {} })

    return
  }

  const held = await effectivePermissions(request, database)

  if (keys.some((key) => held.includes(key))) {
    return
  }

  // Keys are catalog constants, no PII — they help to spot a wrong guard.
  request.log.debug({ code: 'forbidden', required: keys })

  await reply.code(403).send({ code: 'forbidden', params: {} })
}

/** preHandler factory around `checkPermission`, used by every guarded route. */
export function requirePermission(
  database: PermissionDatabase,
  ...keys: PermissionKey[]
): preHandlerHookHandler {
  return async (request, reply) => checkPermission(database, keys, request, reply)
}

export type PermissionProbeOptions = {
  database: PermissionDatabase
}

/**
 * Probe routes for the guard, registered only when `NODE_ENV=test` (§3.7): the
 * comma-separated keys of `:keys` run through the same check the guards use, so
 * the tests exercise the real route chain instead of calling a preHandler by hand.
 */
export const permissionProbeRoutes = fp<PermissionProbeOptions>(
  async (app, { database }) => {
    app.get<{ Params: { keys: string } }>(
      '/api/v1/_test/require-permission/:keys',
      {
        preHandler: async (request, reply) => {
          const requested = request.params.keys
            .split(',')
            .map((key) => key.trim())
            .filter(isPermissionKey)

          await checkPermission(database, requested, request, reply)
        },
      },
      async () => ({ allowed: true }),
    )
  },
  { name: 'stoerdesk-permission-probe' },
)
