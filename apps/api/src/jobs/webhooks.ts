import { PgBoss } from 'pg-boss'

import { createDatabase } from '../db/client'
import {
  collectPendingWebhooks,
  processWebhookDeliveries,
  WEBHOOK_DELIVERY_CRON,
  WEBHOOK_DELIVERY_QUEUE,
} from '../webhooks/delivery'
import type { QrCleanupLogger } from './qr-cleanup'

/**
 * Per-minute webhook delivery worker (`specs/08-objects-api.md` §9.5,
 * ADR-0013, WP-M10-10). The plain functions stay callable without pg-boss; the
 * scheduler is started only from the direct API start.
 */

export async function startWebhookDeliveryJob(
  connectionString: string,
  log?: QrCleanupLogger,
): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString })

  boss.on('error', (error: Error) => {
    log?.error({ err: error, queue: WEBHOOK_DELIVERY_QUEUE }, 'webhook delivery job failed')
  })

  await boss.start()
  await boss.createQueue(WEBHOOK_DELIVERY_QUEUE)

  await boss.work(WEBHOOK_DELIVERY_QUEUE, async () => {
    const { client, database } = createDatabase(connectionString)

    try {
      const collected = await collectPendingWebhooks(database)
      const run = await processWebhookDeliveries(database, new Date(), log)

      log?.info(
        { queue: WEBHOOK_DELIVERY_QUEUE, collected, ...run },
        'webhook delivery run finished',
      )
    } finally {
      await client.end({ timeout: 5 })
    }
  })

  await boss.schedule(WEBHOOK_DELIVERY_QUEUE, WEBHOOK_DELIVERY_CRON)

  return boss
}
