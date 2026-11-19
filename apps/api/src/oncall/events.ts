import { asc, eq, inArray } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallEvents, users, type OnCallShiftState } from '../db/schema'

type Db = Database['database']
type DbLike = Pick<Db, 'insert' | 'select'>

type HistoryPerson = {
  id: string
  givenName: string
  familyName: string
  email: string
}

export type ShiftHistoryEntry = {
  id: string
  type: string
  createdAt: Date
  actor: HistoryPerson | null
  person: HistoryPerson | null
  fromState: OnCallShiftState | null
  toState: OnCallShiftState | null
  reason: string | null
}

const SHIFT_STATES = new Set<string>([
  'UNFILLED',
  'DRAFT',
  'PLANNED',
  'CONFIRMED',
  'DECLINED',
  'SWAP_REQUESTED',
])

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringOf(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]

  return typeof value === 'string' ? value : null
}

function stateOf(value: string | null): OnCallShiftState | null {
  return value !== null && SHIFT_STATES.has(value) ? (value as OnCallShiftState) : null
}

/** The person an event refers to: the assignee of an allocation, the target of
 *  a swap request. A publish without an assignee refers to nobody. */
function personIdOf(type: string, payload: Record<string, unknown>): string | null {
  if (type === 'swap_requested') {
    return stringOf(payload, 'targetUserId')
  }

  if (
    type === 'shift_created' ||
    type === 'shift_updated' ||
    type === 'swap_approved'
  ) {
    return stringOf(payload, 'userId')
  }

  return null
}

/**
 * Reads the append-only history of one shift oldest first (`specs/04-oncall.md`
 * §4a.10, WP-M14-154a). The answer names the acting person and the referenced
 * person; a raw event payload never leaves this function.
 */
export async function readShiftHistory(
  database: Db,
  shiftId: string,
): Promise<ShiftHistoryEntry[]> {
  const rows = await database
    .select({
      id: oncallEvents.id,
      actorUserId: oncallEvents.actorUserId,
      payload: oncallEvents.payload,
      createdAt: oncallEvents.createdAt,
    })
    .from(oncallEvents)
    .where(eq(oncallEvents.shiftId, shiftId))
    .orderBy(asc(oncallEvents.createdAt), asc(oncallEvents.id))

  const payloads = rows.map((row) => asRecord(row.payload))
  const personIds = payloads.map((payload) =>
    personIdOf(stringOf(payload, 'type') ?? '', payload),
  )
  const userIds = [
    ...new Set(
      rows.flatMap((row, index) => {
        const ids = [row.actorUserId, personIds[index]]

        return ids.filter((id): id is string => typeof id === 'string')
      }),
    ),
  ]

  const people =
    userIds.length === 0
      ? []
      : await database
          .select({
            id: users.id,
            givenName: users.givenName,
            familyName: users.familyName,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, userIds))

  const byId = new Map(people.map((person) => [person.id, person]))

  return rows.map((row, index) => {
    const payload = payloads[index]!
    const type = stringOf(payload, 'type') ?? 'unknown'
    const personId = personIds[index]

    return {
      id: row.id,
      type,
      createdAt: row.createdAt,
      actor: row.actorUserId === null ? null : byId.get(row.actorUserId) ?? null,
      person: personId === null || personId === undefined ? null : byId.get(personId) ?? null,
      fromState: stateOf(stringOf(payload, 'from')),
      toState: stateOf(stringOf(payload, 'to')),
      reason: stringOf(payload, 'reason'),
    }
  })
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

/**
 * Appends one append-only `oncall_events` row inside the caller's transaction.
 *
 * A `clientUuid` makes a confirm/decline replay idempotent: when the unique
 * index on `oncall_events.client_uuid` rejects the insert, the existing event
 * row is returned instead of failing.
 */
export async function appendOncallEvent(
  executor: DbLike,
  input: {
    shiftId: string
    type: string
    actorUserId?: string | null
    payload?: Record<string, unknown>
    clientUuid?: string | null
  },
): Promise<{ id: string; createdAt: Date } | null> {
  const { shiftId, type, actorUserId, payload = {}, clientUuid } = input

  try {
    const [inserted] = await executor
      .insert(oncallEvents)
      .values({
        shiftId: shiftId,
        actorKind: actorUserId === undefined || actorUserId === null ? 'system' : 'user',
        actorUserId: actorUserId ?? null,
        payload: { type, ...payload },
        clientUuid: clientUuid ?? null,
      })
      .returning({ id: oncallEvents.id, createdAt: oncallEvents.createdAt })

    if (inserted !== undefined) {
      return inserted
    }
  } catch (error) {
    if (
      isUniqueViolation(error) &&
      clientUuid !== undefined &&
      clientUuid !== null
    ) {
      const [existing] = await executor
        .select({ id: oncallEvents.id, createdAt: oncallEvents.createdAt })
        .from(oncallEvents)
        .where(eq(oncallEvents.clientUuid, clientUuid))
        .limit(1)

      if (existing !== undefined) {
        return existing
      }
    }

    throw error
  }

  return null
}
