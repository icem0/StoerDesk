import { and, eq, gte, sql } from 'drizzle-orm'

import { PERMISSIONS } from '@stoerdesk/shared'

import { usersWithPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { notificationItems } from '../db/schema'
import type { PersonalDelivery } from './outbox'
import { userChannels } from './receivers'

/**
 * The alarm of a failed delivery (`specs/10-notifications.md` §11.18,
 * ADR-0052): a message that never arrived becomes a **task of the
 * administration**.
 *
 * The group is the users with `notification.read_all` — the ones who may read
 * the messages of the other users (§11.16). The way is the **confirmed channel
 * of the recipient** (§11.4, ADR-0045): the administration is reached the way
 * every other user is reached, over no special channel of the installation. A
 * recipient who does not fulfil the rule of the administration (§11.9) has no
 * confirmed channel and gets nothing — the failure stays visible in the
 * protocol.
 */

type Db = Database['database']

/**
 * The event type of the alarm (`specs/10-notifications.md` §11.18): an
 * instance event — no user selects a channel for it, and the row of the outbox
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

/** One delivery that never arrived. */
export interface DeliveryFailure {
  /** The channel of the failed attempt. */
  channel: string
  /** The machine code of the failure (`send_failed`, `http_403`, …). */
  errorCode: string
  /** The event of the message that never arrived. */
  eventType: string
  /** The ticket of the message — empty for a message without a ticket. */
  ticketNo: string | null
}

/**
 * The deliveries of the alarm: one per confirmed channel of every recipient
 * with the right `notification.read_all`.
 *
 * The module answers the **deliveries**, not the rows: the caller writes them
 * with `enqueuePersonalDeliveries`, which writes the task of the recipient and
 * the protocol rows of the attempts (§11.18).
 *
 * The throttle answers an empty list while a task of the same channel and the
 * same machine code is younger than an hour.
 */
export async function deliveryFailureDeliveries(
  database: Pick<Db, 'select'>,
  failure: DeliveryFailure,
  now: Date = new Date(),
): Promise<PersonalDelivery[]> {
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
  const deliveries: PersonalDelivery[] = []

  for (const userId of recipients) {
    const channels = await userChannels(database, userId)

    for (const channel of channels) {
      deliveries.push({
        userId,
        channel: channel.channel,
        eventType: DELIVERY_FAILURE_EVENT,
        title: failure.ticketNo === null || failure.ticketNo === '' ? failure.channel : failure.ticketNo,
        body: [failure.channel, failure.errorCode, failure.eventType].join(' · '),
        target: {
          channel: failure.channel,
          code: failure.errorCode,
          eventType: failure.eventType,
          ticketNo: failure.ticketNo ?? '',
        },
      })
    }
  }

  return deliveries
}
