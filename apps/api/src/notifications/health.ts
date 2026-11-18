import { and, eq, gte, sql } from 'drizzle-orm'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { outbox } from '../db/schema'
import { configuredChannels } from './channels'

type Db = Database['database']

/**
 * The event type of the warning of a broken channel (`specs/10-notifications.md`
 * §11.15, ADR-0028). The row belongs to no ticket and to no shift.
 */
export const CHANNEL_HEALTH_WARNING_EVENT = 'channel.health_warning'

/** The warning of a broken channel goes out at most once per day. */
export const CHANNEL_HEALTH_WARNING_INTERVAL_MS = 24 * 60 * 60 * 1000

/** One broken channel — the kind of the channel and the machine code of its last failure. */
export interface ChannelHealth {
  /** The kind of the channel (`ntfy`, `telegram`, …) — never a secret. */
  channel: string
  /** The machine code of the last failure (`push_subscription_dead`, `http_401`, …). */
  code: string
}

/**
 * The broken channels of the instance: their last delivery failed and no
 * delivery of them succeeded since. The rows are the ones of the dashboard tile
 * (§11.8) — the names, the counters and the machine codes only, never a ticket
 * number and never contact data.
 */
export async function evaluateChannelHealth(database: Db): Promise<ChannelHealth[]> {
  const rows = (await database.execute(sql`
    SELECT
      channel,
      MAX(CASE WHEN state = 'SENT' THEN created_at END) AS last_sent_at,
      MAX(CASE WHEN state = 'FAILED' THEN created_at END) AS last_failed_at,
      MAX(CASE WHEN state = 'FAILED' THEN target->>'lastError' END) AS last_error
    FROM outbox
    GROUP BY channel
    ORDER BY channel
  `)) as {
    channel: string
    last_sent_at: Date | null
    last_failed_at: Date | null
    last_error: string | null
  }[]

  return rows
    .filter((row) => {
      if (row.last_failed_at === null) {
        return false
      }

      if (row.last_sent_at === null) {
        return true
      }

      return new Date(row.last_sent_at).getTime() < new Date(row.last_failed_at).getTime()
    })
    .map((row) => ({
      channel: row.channel,
      code: row.last_error ?? '',
    }))
}

/**
 * The channel the warning of a broken channel goes out over: the first
 * configured channel of the chain that is not the broken one. A broken channel
 * without another configured channel writes nothing — the badge of the
 * administration (§11.8) stays the only warning.
 */
export function warningChannelOf(env: Env, brokenChannel: string): string {
  const chain = configuredChannels(env).map((channel) => channel.name)

  return chain.find((channel) => channel !== brokenChannel) ?? ''
}

/**
 * Writes one warning row per broken channel — at most one per channel and per
 * day. The row carries the broken channel and the machine code of its last
 * failure in its `target`; the message of the row is the translated text of
 * `notification.channel_health_warning` (§11.15).
 */
export async function enqueueChannelHealthWarnings(
  database: Db,
  env: Env,
  now: Date = new Date(),
): Promise<number> {
  const broken = await evaluateChannelHealth(database)

  if (broken.length === 0) {
    return 0
  }

  const since = new Date(now.getTime() - CHANNEL_HEALTH_WARNING_INTERVAL_MS)
  let written = 0

  for (const health of broken) {
    const warningChannel = warningChannelOf(env, health.channel)

    if (warningChannel === '') {
      continue
    }

    const recent = await database
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          eq(outbox.eventType, CHANNEL_HEALTH_WARNING_EVENT),
          sql`${outbox.target}->>'channel' = ${health.channel}`,
          gte(outbox.createdAt, since),
        ),
      )

    const alreadyWarned = recent.length > 0

    if (alreadyWarned) {
      continue
    }

    await database.insert(outbox).values({
      eventType: CHANNEL_HEALTH_WARNING_EVENT,
      channel: warningChannel,
      target: { channel: health.channel, code: health.code },
    })

    written += 1
  }

  return written
}
