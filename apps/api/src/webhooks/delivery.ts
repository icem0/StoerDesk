import { createHmac } from 'node:crypto'
import { and, asc, eq, gte, inArray, lte, notExists, sql } from 'drizzle-orm'
import type { WebhookEventType } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import {
  objects,
  ticketEvents,
  tickets,
  webhookDeliveries,
  webhookEndpoints,
} from '../db/schema'
import type { QrCleanupLogger } from '../jobs/qr-cleanup'

/**
 * Webhook delivery (`specs/08-objects-api.md` §9.5, ADR-0013, WP-M10-10).
 *
 * The ticket transaction only appends its `ticket_events` row; this module turns
 * that row into delivery rows afterwards and sends them with an HMAC signature.
 * The secret, the URL and the body never enter a log line.
 */

type Db = Database['database']

/** The ticket event types that map to `ticket.status_changed`. */
export const WEBHOOK_STATUS_EVENT_TYPES = [
  'review_started',
  'work_order_set',
  'assigned',
  'offered',
  'claimed',
  'accepted',
  'declined',
  'acknowledged',
  'closed',
  'reopened',
  'uncancelled',
  'cancelled',
] as const

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery'

/** One delivery run per minute. */
export const WEBHOOK_DELIVERY_CRON = '* * * * *'

export const WEBHOOK_DELIVERY_MAX_ATTEMPTS = 5

/** Delays after failed attempts 1, 2, 3 and 4; attempt 5 is terminal. */
export const WEBHOOK_DELIVERY_BACKOFF_SECONDS = [1, 5, 25, 125] as const

export const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000

/** The subscription a raw `ticket_events.type` belongs to. */
export function webhookEventTypeFor(rawType: string): WebhookEventType | undefined {
  if (rawType === 'created') {
    return 'ticket.created'
  }

  if ((WEBHOOK_STATUS_EVENT_TYPES as readonly string[]).includes(rawType)) {
    return 'ticket.status_changed'
  }

  return undefined
}

/**
 * HMAC-SHA256 over `<timestamp>.<body>` in lowercase hex. The routing header
 * carries the same value as `t=<timestamp>,v1=<hex>`.
 */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export function signatureHeader(secret: string, timestamp: string, body: string): string {
  return `t=${timestamp},v1=${signWebhook(secret, timestamp, body)}`
}

export interface WebhookDeliveryPayload {
  event: WebhookEventType
  eventId: string
  occurredAt: string
  ticket: {
    ticketNo: string
    status: string
    priority: string
    objectNo: string
    objectName: string
  }
}

/**
 * Inserts one `PENDING` delivery row per active endpoint that subscribes to an
 * event not delivered yet. The unique `(endpoint_id, event_id)` key makes a
 * repeated scan a no-op. Returns how many rows were added.
 */
export async function collectPendingWebhooks(database: Db, now: Date = new Date()): Promise<number> {
  const endpoints = await database
    .select({
      id: webhookEndpoints.id,
      events: webhookEndpoints.events,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.active, true))

  let inserted = 0

  for (const endpoint of endpoints) {
    const rawTypes = [
      ...new Set(
        endpoint.events.flatMap((event) =>
          event === 'ticket.created' ? ['created'] : [...WEBHOOK_STATUS_EVENT_TYPES],
        ),
      ),
    ]

    const pending = await database
      .select({ id: ticketEvents.id, type: ticketEvents.type })
      .from(ticketEvents)
      .where(
        and(
          inArray(ticketEvents.type, rawTypes),
          gte(ticketEvents.createdAt, endpoint.createdAt),
          lte(ticketEvents.createdAt, now),
          notExists(
            database
              .select({ one: sql`1` })
              .from(webhookDeliveries)
              .where(
                and(
                  eq(webhookDeliveries.endpointId, endpoint.id),
                  eq(webhookDeliveries.eventId, ticketEvents.id),
                ),
              ),
          ),
        ),
      )

    const rows = pending.flatMap((event) => {
      const eventType = webhookEventTypeFor(event.type)

      return eventType === undefined ? [] : [{ endpointId: endpoint.id, eventId: event.id, eventType }]
    })

    if (rows.length === 0) {
      continue
    }

    const added = await database
      .insert(webhookDeliveries)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.id })

    inserted += added.length
  }

  return inserted
}

export interface DeliveryAttempt {
  ok: boolean
  status: number | null
  durationMs: number
}

/** Sends one signed request; network errors and timeouts count as failures. */
export async function deliverWebhook(
  input: {
    url: string
    secret: string
    eventType: WebhookEventType
    body: string
    timestamp: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryAttempt> {
  const startedAt = Date.now()

  try {
    const response = await fetchImpl(input.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'StoerDesk-Webhook/1.0',
        'x-stoerdesk-event': input.eventType,
        'x-stoerdesk-signature': signatureHeader(input.secret, input.timestamp, input.body),
      },
      body: input.body,
      signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
    })

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }
  } catch {
    return { ok: false, status: null, durationMs: Date.now() - startedAt }
  }
}

/** The state after a failed attempt: retry with backoff or fail terminally. */
export function failureOutcome(
  attempts: number,
  now: Date,
): { status: 'PENDING' | 'FAILED'; nextAttemptAt: Date } {
  if (attempts >= WEBHOOK_DELIVERY_MAX_ATTEMPTS) {
    return { status: 'FAILED', nextAttemptAt: now }
  }

  const delay = WEBHOOK_DELIVERY_BACKOFF_SECONDS[attempts - 1] ?? 125

  return { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + delay * 1000) }
}

export interface WebhookDeliveryResult {
  sent: number
  failed: number
  retried: number
}

const DELIVERY_BATCH_SIZE = 100

/**
 * Sends every due `PENDING` delivery. A `NULL` endpoint (an endpoint deleted
 * after the row was queued) is marked `FAILED` without a request, so its
 * history stays readable. Only status and duration are logged.
 */
export async function processWebhookDeliveries(
  database: Db,
  now: Date = new Date(),
  log?: QrCleanupLogger,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookDeliveryResult> {
  const due = await database
    .select({
      id: webhookDeliveries.id,
      eventId: webhookDeliveries.eventId,
      eventType: webhookDeliveries.eventType,
      attempts: webhookDeliveries.attempts,
      endpointUrl: webhookEndpoints.url,
      endpointSecret: webhookEndpoints.secret,
      eventAt: ticketEvents.createdAt,
      ticketNo: tickets.ticketNo,
      status: tickets.status,
      priority: tickets.priority,
      objectNo: objects.objectNo,
      objectName: objects.name,
    })
    .from(webhookDeliveries)
    .leftJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .innerJoin(ticketEvents, eq(ticketEvents.id, webhookDeliveries.eventId))
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .innerJoin(objects, eq(objects.id, tickets.objectId))
    .where(and(eq(webhookDeliveries.status, 'PENDING'), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(DELIVERY_BATCH_SIZE)

  const result: WebhookDeliveryResult = { sent: 0, failed: 0, retried: 0 }

  for (const row of due) {
    const attempts = row.attempts + 1

    if (row.endpointUrl === null || row.endpointSecret === null) {
      await database
        .update(webhookDeliveries)
        .set({ status: 'FAILED', attempts, updatedAt: now })
        .where(eq(webhookDeliveries.id, row.id))
      result.failed += 1
      continue
    }

    const eventType = row.eventType as WebhookEventType
    const body = JSON.stringify({
      event: eventType,
      eventId: row.eventId,
      occurredAt: row.eventAt.toISOString(),
      ticket: {
        ticketNo: row.ticketNo,
        status: row.status,
        priority: row.priority,
        objectNo: row.objectNo,
        objectName: row.objectName,
      },
    } satisfies WebhookDeliveryPayload)
    const timestamp = Math.floor(now.getTime() / 1000).toString()
    const attempt = await deliverWebhook(
      {
        url: row.endpointUrl,
        secret: row.endpointSecret,
        eventType,
        body,
        timestamp,
      },
      fetchImpl,
    )

    if (attempt.ok) {
      await database
        .update(webhookDeliveries)
        .set({
          status: 'SENT',
          attempts,
          lastStatus: attempt.status,
          lastDurationMs: attempt.durationMs,
          updatedAt: now,
        })
        .where(eq(webhookDeliveries.id, row.id))
      result.sent += 1
    } else {
      const outcome = failureOutcome(attempts, now)

      await database
        .update(webhookDeliveries)
        .set({
          status: outcome.status,
          attempts,
          lastStatus: attempt.status,
          lastDurationMs: attempt.durationMs,
          nextAttemptAt: outcome.nextAttemptAt,
          updatedAt: now,
        })
        .where(eq(webhookDeliveries.id, row.id))

      if (outcome.status === 'FAILED') {
        result.failed += 1
      } else {
        result.retried += 1
      }
    }

    log?.info(
      {
        queue: WEBHOOK_DELIVERY_QUEUE,
        status: attempt.status,
        durationMs: attempt.durationMs,
        delivery: row.id,
      },
      'webhook delivery attempt finished',
    )
  }

  return result
}
