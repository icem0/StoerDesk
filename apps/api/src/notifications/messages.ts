import { and, count, desc, eq, sql } from 'drizzle-orm'
import {
  type NotificationDeliveryAttempt,
  type NotificationDeliveryAttemptFilter,
  type NotificationRecipientSummary,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { notificationMessages, outbox, users } from '../db/schema'

type Db = Database['database']

/**
 * The name of a user: the given and the family name, else the e-mail. The
 * protocol of §11.16 names the addressees of the delivery attempts.
 */
function displayName(givenName: string, familyName: string, email: string): string {
  const name = `${givenName} ${familyName}`.trim()

  return name === '' ? email : name
}

/**
 * The scope of the protocol (`specs/10-notifications.md` §11.16, ADR-0052):
 * the delivery attempts of the answer and their filters.
 */
export type DeliveryScope = {
  /** The filters of the answer. */
  filter: NotificationDeliveryAttemptFilter
  limit: number
  offset: number
}

/** The conditions of the filter of the protocol (§11.16). */
function deliveryConditions(filter: NotificationDeliveryAttemptFilter) {
  const conditions = []

  if (filter.userId !== undefined) {
    conditions.push(eq(notificationMessages.userId, filter.userId))
  }

  if (filter.channel !== undefined) {
    conditions.push(eq(notificationMessages.channel, filter.channel))
  }

  if (filter.eventType !== undefined) {
    conditions.push(eq(notificationMessages.eventType, filter.eventType))
  }

  if (filter.state !== undefined) {
    conditions.push(eq(notificationMessages.state, filter.state))
  }

  return conditions
}

/**
 * The delivery attempts of the instance (`specs/10-notifications.md` §11.16,
 * ADR-0052): one row per user and channel with the state of the delivery, the
 * machine code of a failure and the number of the attempts. The protocol names
 * the users — the right `notification.read_all` guards the route.
 *
 * The error code and the number of the attempts live in the row of the
 * outbox: the row of the message carries the state, the row of the outbox the
 * outcome of the send.
 */
export async function readDeliveries(
  database: Db,
  scope: DeliveryScope,
): Promise<NotificationDeliveryAttempt[]> {
  const conditions = deliveryConditions(scope.filter)

  const rows = await database
    .select({
      id: notificationMessages.id,
      userId: notificationMessages.userId,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
      eventType: notificationMessages.eventType,
      channel: notificationMessages.channel,
      state: notificationMessages.state,
      title: notificationMessages.title,
      createdAt: notificationMessages.createdAt,
      errorCode: sql<string | null>`${outbox.target}->>'lastError'`,
      attempts: outbox.attempts,
      updatedAt: outbox.updatedAt,
    })
    .from(notificationMessages)
    .innerJoin(users, eq(users.id, notificationMessages.userId))
    .leftJoin(outbox, eq(outbox.notificationMessageId, notificationMessages.id))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(notificationMessages.createdAt))
    .limit(scope.limit)
    .offset(scope.offset)

  return rows.map((row) => ({
    id: row.id,
    recipient: {
      userId: row.userId,
      name: displayName(row.givenName, row.familyName, row.email),
    },
    eventType: row.eventType,
    channel: row.channel,
    state: row.state as NotificationDeliveryAttempt['state'],
    title: row.title,
    errorCode: row.errorCode ?? null,
    attempts: Number(row.attempts ?? 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  }))
}

/**
 * The recipients of the protocol (`specs/10-notifications.md` §11.16): the
 * addressees with the number of their attempts. The filter of the recipient is
 * not applied here, so the list stays complete while that filter is active.
 */
export async function readDeliveryRecipients(
  database: Db,
  filter: NotificationDeliveryAttemptFilter,
): Promise<NotificationRecipientSummary[]> {
  const conditions = deliveryConditions({ ...filter, userId: undefined })

  const rows = await database
    .select({
      userId: notificationMessages.userId,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
      attempts: count(),
    })
    .from(notificationMessages)
    .innerJoin(users, eq(users.id, notificationMessages.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .groupBy(notificationMessages.userId, users.givenName, users.familyName, users.email)
    .orderBy(desc(count()), users.familyName, users.givenName)

  return rows.map((row) => ({
    userId: row.userId,
    name: displayName(row.givenName, row.familyName, row.email),
    count: Number(row.attempts),
  }))
}
