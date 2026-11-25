import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import type { NotificationItem } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationItems } from '../db/schema'

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>
/** The write side of the service — the outbox writes the tasks in its transaction. */
type DbWrite = Pick<Db, 'insert' | 'update'>

/**
 * The task of a user (`specs/10-notifications.md` §11.18, ADR-0052): one row
 * per user and event. The delivery attempts stay in `notification_messages`
 * (the protocol of §11.16) and point at the task.
 *
 * The module owns four things: the writing of a task next to a personal
 * delivery, the reading of the tasks of a user, the number of the unhandled
 * tasks and the read receipt.
 */

/**
 * The scope of the list of the tasks (`specs/10-notifications.md` §11.18): the
 * user of the tasks and the filters of the answer.
 */
export type ItemScope = {
  /** The owner of the tasks — the inbox of a user is personal. */
  userId: string
  /** The event type of the tasks, empty for every event. */
  eventType?: string
  /** Only the tasks without a read receipt. */
  unread?: boolean
  limit: number
  offset: number
}

/**
 * The params of a task (`specs/10-notifications.md` §11.13): the machine
 * params of the message (§11.5) **without** the target of the user — the topic
 * of ntfy and the target of the account are the way of the delivery, never the
 * content of a task.
 */
export function taskParams(target: Record<string, unknown>): Record<string, unknown> {
  const params = { ...target }

  delete params.ntfyTopic
  delete params.recipientTarget

  return params
}

/** The number of the ticket in the params of a message, or nothing. */
function ticketNoOf(target: Record<string, unknown>): string | null {
  const value = target.ticketNo

  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * One personal delivery of the notification layer — the row of a protocol that
 * belongs to a task (`specs/10-notifications.md` §11.18). The service needs
 * the addressee, the event and the params; the row itself is written by the
 * outbox.
 */
export interface ItemDelivery {
  /** The addressee of the delivery. */
  userId: string
  /** The event the delivery announces. */
  eventType: string
  /** The machine-readable params of the message (§11.5). */
  target: Record<string, unknown>
  /** The shift of the delivery, empty for a delivery of a ticket. */
  shiftId?: string | null
}

/**
 * Writes **one** task per user and event — no matter how many channels carry
 * the message (`specs/10-notifications.md` §11.18, ADR-0052 decision 1). A
 * technician with three confirmed channels sees one task and not three.
 *
 * Returns the id of the task per user and event, so the caller can point every
 * delivery attempt at its task.
 */
export async function writeItems(
  database: Pick<Db, 'insert'>,
  deliveries: readonly ItemDelivery[],
): Promise<Map<string, string>> {
  const written = new Map<string, string>()

  if (deliveries.length === 0) {
    return written
  }

  // One task per user and event: the deliveries of one event over several
  // channels of the same user become one task.
  const grouped = new Map<string, ItemDelivery>()

  for (const delivery of deliveries) {
    const key = `${delivery.userId}:${delivery.eventType}`

    if (!grouped.has(key)) {
      grouped.set(key, delivery)
    }
  }

  const rows = await database
    .insert(notificationItems)
    .values(
      [...grouped.values()].map((delivery) => ({
        userId: delivery.userId,
        eventType: delivery.eventType,
        params: taskParams(delivery.target),
        ticketNo: ticketNoOf(delivery.target),
        shiftId: delivery.shiftId ?? null,
      })),
    )
    .returning({ id: notificationItems.id, userId: notificationItems.userId, eventType: notificationItems.eventType })

  for (const row of rows) {
    written.set(`${row.userId}:${row.eventType}`, row.id)
  }

  return written
}

/**
 * The tasks of a user (`specs/10-notifications.md` §11.18): the newest first,
 * with the filters of the scope. The inbox of a user is personal — the scope
 * always names the owner.
 */
export async function readItems(
  database: DbSelect,
  scope: ItemScope,
): Promise<NotificationItem[]> {
  const conditions = [eq(notificationItems.userId, scope.userId)]

  if (scope.eventType !== undefined) {
    conditions.push(eq(notificationItems.eventType, scope.eventType))
  }

  if (scope.unread === true) {
    conditions.push(isNull(notificationItems.readAt))
  }

  if (scope.unread === false) {
    conditions.push(isNotNull(notificationItems.readAt))
  }

  const rows = await database
    .select({
      id: notificationItems.id,
      eventType: notificationItems.eventType,
      params: notificationItems.params,
      ticketNo: notificationItems.ticketNo,
      shiftId: notificationItems.shiftId,
      createdAt: notificationItems.createdAt,
      readAt: notificationItems.readAt,
    })
    .from(notificationItems)
    .where(and(...conditions))
    .orderBy(desc(notificationItems.createdAt))
    .limit(scope.limit)
    .offset(scope.offset)

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    params: (row.params ?? {}) as Record<string, unknown>,
    ticketNo: row.ticketNo,
    shiftId: row.shiftId,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }))
}

/**
 * The number of the unhandled tasks of a user (`specs/10-notifications.md`
 * §11.18): the badge of the bell and the band of the alarm count the tasks,
 * not the attempts.
 */
export async function countUnreadItems(database: DbSelect, userId: string): Promise<number> {
  const [row] = await database
    .select({ count: count() })
    .from(notificationItems)
    .where(and(eq(notificationItems.userId, userId), isNull(notificationItems.readAt)))

  return Number(row?.count ?? 0)
}

/**
 * The read receipt of one own task (`specs/10-notifications.md` §11.18): the
 * task of another user or an unknown id answers `null` — the receipt is bound
 * to the session.
 */
export async function markItemRead(
  database: DbWrite,
  id: string,
  userId: string,
): Promise<{ id: string; readAt: string | null } | null> {
  const [row] = await database
    .update(notificationItems)
    .set({ readAt: new Date() })
    .where(and(eq(notificationItems.id, id), eq(notificationItems.userId, userId)))
    .returning({ id: notificationItems.id, readAt: notificationItems.readAt })

  if (row === undefined) {
    return null
  }

  return { id: row.id, readAt: row.readAt?.toISOString() ?? null }
}
