import { PgBoss } from 'pg-boss'

import { createDatabase } from '../db/client'
import { evaluateEscalations } from '../tickets/escalation'
import type { QrCleanupLogger } from './qr-cleanup'

/**
 * Minute escalation scan (`specs/07-escalation.md` §7.3, WP-M6-09).
 *
 * The scheduler only exists in the direct API start; `buildServer()` stays
 * job-free, so tests never create the pg-boss schema. Each run opens its own
 * short-lived pool and writes only the aggregate counters to the log.
 */

export const TICKET_ESCALATION_QUEUE = 'ticket-escalation'

/** One scan per minute; the rules resolve in minutes, not seconds. */
export const TICKET_ESCALATION_CRON = '* * * * *'

export type TicketEscalationLogger = QrCleanupLogger

export async function startTicketEscalation(
  connectionString: string,
  log?: TicketEscalationLogger,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    // Message and stack only: pg-boss errors never carry credentials.
    log?.error({ err: error, queue: TICKET_ESCALATION_QUEUE }, 'escalation job failed')
  })

  await boss.start()
  await boss.createQueue(TICKET_ESCALATION_QUEUE)

  await boss.work(TICKET_ESCALATION_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const { scanned, fired, offerScanned, offerEscalated } = await evaluateEscalations(database)

      log?.info(
        { queue: TICKET_ESCALATION_QUEUE, scanned, fired, offerScanned, offerEscalated },
        'escalation scan finished',
      )
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(TICKET_ESCALATION_QUEUE, TICKET_ESCALATION_CRON)

  return boss
}
