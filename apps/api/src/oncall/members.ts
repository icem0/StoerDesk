import { and, asc, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallPools, roles, userGroups, userRoles, users } from '../db/schema'

/**
 * The technicians of a pool and of a group (`specs/04-oncall.md` §4a.5,
 * `specs/07-escalation.md` §7.14, ADR-0026).
 *
 * A readiness pool with a `group_id` has the members of that group, a pool
 * without one has every active user holding the `oncall` role — the rule of
 * `GET /api/v1/oncall/pools/:id/members`. A user group has the members of
 * `user_groups`. Only active users count; a deactivated technician is nobody.
 */

type Db = Database['database']

/**
 * The members of a user group, ordered by name — the members of the group of
 * the administration and the group of a readiness pool.
 */
export async function resolveGroupMemberIds(database: Db, groupId: string): Promise<string[]> {
  const rows = await database
    .select({ userId: userGroups.userId })
    .from(userGroups)
    .innerJoin(users, eq(users.id, userGroups.userId))
    .where(and(eq(userGroups.groupId, groupId), eq(users.active, true)))
    .orderBy(asc(users.familyName), asc(users.givenName), asc(users.email))

  return rows.map((row) => row.userId)
}

/**
 * The members of a readiness pool: the members of its `group_id`, otherwise
 * every active user holding the `oncall` role. An unknown pool has no member.
 */
export async function resolvePoolMemberIds(database: Db, poolId: string): Promise<string[]> {
  const [pool] = await database
    .select({ groupId: oncallPools.groupId })
    .from(oncallPools)
    .where(eq(oncallPools.id, poolId))
    .limit(1)

  if (pool === undefined) {
    return []
  }

  if (pool.groupId !== null) {
    return resolveGroupMemberIds(database, pool.groupId)
  }

  const rows = await database
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(roles.key, 'oncall'), eq(users.active, true)))
    .orderBy(asc(users.familyName), asc(users.givenName), asc(users.email))

  return rows.map((row) => row.userId)
}
