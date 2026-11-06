import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallEvents } from '../db/schema'

type Db = Database['database']
type DbLike = Pick<Db, 'insert' | 'select'>

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
