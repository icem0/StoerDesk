import { eq, inArray } from 'drizzle-orm'

import type { Database } from '../db/client'
import { settings, users } from '../db/schema'

/**
 * The assignee pool (`specs/07-escalation.md` §7.14, ADR-0039, WP-M19-03).
 *
 * The pool is an **ordered list of active users** the office assigns a ticket
 * to. It is a plain setting of the escalation (`escalation.assignee_pool`) and
 * not new master data: the order of the list is the order of the refusal chain
 * — a technician who declines passes the ticket to the next member of the list
 * (decision 4 of ADR-0039).
 *
 * Only the ids are stored; the names are read with the users, so a renamed
 * technician shows the new name everywhere. A deactivated user keeps its place
 * in the list but is skipped when the pool is resolved.
 */

type Db = Database['database']

/** The setting key of the pool (`PLAN.md` §6, the settings store). */
export const ASSIGNEE_POOL_SETTING_KEY = 'escalation.assignee_pool'

/** The bound of the pool — the office of a small installation never needs more. */
export const ASSIGNEE_POOL_MAX = 50

export class AssigneePoolError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'AssigneePoolError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/**
 * The stored ids of the pool, in the order of the list. A malformed row (a
 * value that is not a list of strings) is read as an empty pool — the setting
 * never breaks a ticket.
 */
export async function readAssigneePoolIds(database: Db): Promise<string[]> {
  const [row] = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, ASSIGNEE_POOL_SETTING_KEY))
    .limit(1)

  const value = row?.value

  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
}

/**
 * Checks a submitted pool: the ids are unique, the list is not longer than the
 * bound and every id names an **active** user. A deactivated or unknown user
 * is refused with `400 invalid_assignee` and the field path of the id.
 */
export async function validateAssigneePool(
  database: Db,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length > ASSIGNEE_POOL_MAX) {
    throw new AssigneePoolError(400, 'invalid_assignee', { fields: ['assigneePool'] })
  }

  const unique = [...new Set(ids)]

  if (unique.length !== ids.length) {
    throw new AssigneePoolError(400, 'invalid_assignee', { fields: ['assigneePool'] })
  }

  if (unique.length === 0) {
    return unique
  }

  const rows = await database
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(inArray(users.id, unique))

  const activeIds = new Set(rows.filter((row) => row.active).map((row) => row.id))
  const invalid = unique.filter((id) => !activeIds.has(id))

  if (invalid.length > 0) {
    throw new AssigneePoolError(400, 'invalid_assignee', { fields: invalid })
  }

  return unique
}

/**
 * Writes the pool. The order of the array is the order of the chain — the
 * service writes the list as it was submitted.
 */
export async function writeAssigneePool(database: Db, ids: readonly string[]): Promise<string[]> {
  const unique = await validateAssigneePool(database, ids)

  await database
    .insert(settings)
    .values({ key: ASSIGNEE_POOL_SETTING_KEY, value: unique, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: unique, updatedAt: new Date() },
    })

  return unique
}

/**
 * The members of the pool with their display names — the answer of the
 * configuration. A deactivated user is skipped: the list is the list of the
 * people a ticket may be assigned to.
 */
export async function readAssigneePool(
  database: Db,
): Promise<{ id: string; name: string }[]> {
  const ids = await readAssigneePoolIds(database)

  if (ids.length === 0) {
    return []
  }

  const rows = await database
    .select({
      id: users.id,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
      active: users.active,
    })
    .from(users)
    .where(inArray(users.id, ids))

  const byId = new Map(rows.map((row) => [row.id, row]))

  return ids.flatMap((id) => {
    const row = byId.get(id)

    if (row === undefined || !row.active) {
      return []
    }

    const name = `${row.givenName ?? ''} ${row.familyName ?? ''}`.trim()

    return [{ id, name: name === '' ? row.email : name }]
  })
}

/**
 * The ids of the pool in the order of the chain, without the deactivated
 * members. The refusal chain walks this list (decision 4 of ADR-0039).
 */
export async function resolveAssigneePool(database: Db): Promise<string[]> {
  const members = await readAssigneePool(database)

  return members.map((member) => member.id)
}

/**
 * The member of the pool after the given user — the next one of the chain.
 * A user that is not a member of the pool has no successor, so the answer is
 * `null` and the ticket keeps its status (`declined`).
 */
export function nextAssignee(
  pool: readonly string[],
  currentUserId: string,
): string | null {
  const index = pool.indexOf(currentUserId)

  if (index < 0) {
    return null
  }

  return pool.slice(index + 1).find((id) => id !== currentUserId) ?? null
}

/**
 * The member of the pool that gets the ticket first — the head of the chain.
 * An empty pool has nobody.
 */
export function firstAssignee(pool: readonly string[]): string | null {
  return pool[0] ?? null
}
