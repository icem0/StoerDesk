import { and, eq, gte, sql } from 'drizzle-orm'

import { PERMISSIONS } from '@stoerdesk/shared'

import { usersWithPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { notificationItems } from '../db/schema'
import { writeItems, type ItemDelivery } from './items'

/**
 * The alarm of a failed delivery (`specs/10-notifications.md` §11.18,
 * ADR-0052, ADR-0062): a delivery that ends `FAILED` becomes a **task of the
 * administration**.
 *
 * The group is the users with `notification.read_all` — the ones who may read
 * the messages of the other users (§11.16). The task lives in the **mailbox
 * only**: the administration finds it in its inbox, the bell and the alarm band
 * count it. Nothing is sent over a channel, so the alarm cannot fail over a
 * channel of its own and an administrator without a confirmed channel is
 * reached too.
 */

type Db = Database['database']
type DbRead = Pick<Db, 'select'>
type DbWrite = Pick<Db, 'select' | 'insert'>

/**
 * The event type of the alarm (`specs/10-notifications.md` §11.18): an
 * instance event — no user selects a channel for it, and the row of the task
 * belongs to no ticket and to no shift.
 */
export const DELIVERY_FAILURE_EVENT = 'notification.delivery_failed'

/**
 * The throttle of the alarm: **one** task per channel and machine code per
 * hour. A channel that is broken for a day must not flood the inbox of the
 * administration — the office learns the failure once and the protocol shows
 * the rest.
 */
export const DELIVERY_FAILURE_THROTTLE_MS = 60 * 60 * 1000

/** One delivery that ended `FAILED`. */
export interface DeliveryFailure {
  /** The channel of the failed attempt. */
  channel: string
  /** The machine code of the failure (`send_failed`, `http_403`, …). */
  errorCode: string
  /** The event of the message that failed. */
  eventType: string
  /** The ticket of the message — empty for a message without a ticket. */
  ticketNo: string | null
}

/**
 * The tasks of the alarm: one per user with the right `notification.read_all`,
 * written into the mailbox only.
 *
 * The throttle answers an empty list while a task of the same channel and the
 * same machine code is younger than an hour.
 */
export async function deliveryFailureItems(
  database: DbRead,
  failure: DeliveryFailure,
  now: Date = new Date(),
): Promise<ItemDelivery[]> {
  const since = new Date(now.getTime() - DELIVERY_FAILURE_THROTTLE_MS)

  const recent = await database
    .select({ id: notificationItems.id })
    .from(notificationItems)
    .where(
      and(
        eq(notificationItems.eventType, DELIVERY_FAILURE_EVENT),
        sql`${notificationItems.params}->>'channel' = ${failure.channel}`,
        sql`${notificationItems.params}->>'code' = ${failure.errorCode}`,
        gte(notificationItems.createdAt, since),
      ),
    )

  if (recent.length > 0) {
    return []
  }

  const recipients = await usersWithPermission(database, PERMISSIONS.notification.readAll)

  return recipients.map((userId) => ({
    userId,
    eventType: DELIVERY_FAILURE_EVENT,
    target: {
      channel: failure.channel,
      code: failure.errorCode,
      eventType: failure.eventType,
      ticketNo: failure.ticketNo ?? '',
    },
  }))
}

/**
 * Writes the tasks of the alarm into the mailbox of the administration. The
 * caller passes the failure of one `FAILED` outbox row; the throttle of
 * `deliveryFailureItems` decides whether a task is written.
 *
 * Returns the number of the written tasks.
 */
export async function enqueueDeliveryFailureItems(
  database: DbWrite,
  failure: DeliveryFailure,
  now: Date = new Date(),
): Promise<number> {
  const items = await deliveryFailureItems(database, failure, now)

  if (items.length === 0) {
    return 0
  }

  await writeItems(database, items)

  return items.length
}
