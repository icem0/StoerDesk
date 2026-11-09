import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { requirePermission } from '../auth/requirePermission'
import { PERMISSIONS } from '@stoerdesk/shared'
import { buildDashboardSnapshot } from './service'
import type { Database } from '../db/client'

type Db = Database['database']

const PROBE_INTERVAL_MS = 5000
const HEARTBEAT_INTERVAL_MS = 25000

/**
 * One comparable change value for the dashboard probe (`specs/11-dashboard.md`
 * §11.6): the newest `updated_at` of `tickets`, `outbox`, `oncall_shifts` and
 * `settings`, plus the newest `created_at` of the append-only `ticket_pauses`
 * (which has no `updated_at` column), joined into one string.
 */
export async function dashboardChangeProbe(database: Db): Promise<string> {
  const results = await Promise.all([
    database.execute(sql`SELECT max(updated_at) AS m FROM ${sql.raw('tickets')}`),
    database.execute(sql`SELECT max(updated_at) AS m FROM ${sql.raw('outbox')}`),
    database.execute(sql`SELECT max(updated_at) AS m FROM ${sql.raw('oncall_shifts')}`),
    database.execute(sql`SELECT max(created_at) AS m FROM ${sql.raw('ticket_pauses')}`),
    database.execute(sql`SELECT max(updated_at) AS m FROM ${sql.raw('settings')}`),
  ])

  const parts = results.map((result) => {
    const value = result[0]?.m ?? null

    return value === null ? '' : new Date(value as Date).toISOString()
  })

  return parts.join('|')
}

export type DashboardStreamOptions = {
  database: Db
}

/**
 * `GET /api/v1/dashboard/stream` (`specs/11-dashboard.md` §11.6).
 *
 * An authenticated `text/event-stream` that sends one `dashboard` snapshot on
 * connect, re-runs the change probe every five seconds and sends a fresh
 * snapshot only when the probe value changed, and sends a `heartbeat` every 25
 * seconds. Timers are stopped on client disconnect so a closed tab leaks no
 * interval.
 *
 * The probe interval and heartbeat interval can be overridden through the
 * `DASHBOARD_PROBE_INTERVAL_MS` / `DASHBOARD_HEARTBEAT_INTERVAL_MS` environment
 * variables, which the tests use to drive short intervals.
 */
export function registerDashboardStream(
  app: FastifyInstance,
  { database }: DashboardStreamOptions,
): void {
  const probeIntervalMs =
    Number(process.env.DASHBOARD_PROBE_INTERVAL_MS ?? PROBE_INTERVAL_MS) || PROBE_INTERVAL_MS
  const heartbeatIntervalMs =
    Number(process.env.DASHBOARD_HEARTBEAT_INTERVAL_MS ?? HEARTBEAT_INTERVAL_MS) ||
    HEARTBEAT_INTERVAL_MS

  app.get(
    '/api/v1/dashboard/stream',
    {
      preHandler: requirePermission(database, PERMISSIONS.ticket.read),
    },
    async (_request, reply) => {
      reply.hijack()

      const stream = reply.raw

      stream.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      let lastProbeValue: string | null = null
      let probeTimer: ReturnType<typeof setInterval> | null = null
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null

      const stop = () => {
        if (probeTimer !== null) {
          clearInterval(probeTimer)
          probeTimer = null
        }

        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
      }

      stream.on('close', stop)
      stream.on('error', stop)

      const sendSnapshot = async () => {
        const snapshot = await buildDashboardSnapshot(database, {
          now: new Date(),
          includeOnCall: true,
          includeChannels: true,
        })

        stream.write(`event: dashboard\ndata: ${JSON.stringify(snapshot)}\n\n`)
      }

      const sendHeartbeat = () => {
        stream.write('event: heartbeat\ndata: {}\n\n')
      }

      void (async () => {
        try {
          await sendSnapshot()
          lastProbeValue = await dashboardChangeProbe(database)
        } catch {
          stream.end()
          return
        }

        probeTimer = setInterval(async () => {
          try {
            const value = await dashboardChangeProbe(database)

            if (value !== lastProbeValue) {
              lastProbeValue = value
              await sendSnapshot()
            }
          } catch {
            // Probe failures are silent; the next probe tries again.
          }
        }, probeIntervalMs)

        heartbeatTimer = setInterval(sendHeartbeat, heartbeatIntervalMs)
      })()
    },
  )
}
