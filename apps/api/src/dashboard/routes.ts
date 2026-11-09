import fp from 'fastify-plugin'
import { effectivePermissions, requirePermission } from '../auth/requirePermission'
import { PERMISSIONS } from '@stoerdesk/shared'
import { buildDashboardSnapshot } from './service'
import { dashboardSnapshotSchema } from '@stoerdesk/shared'
import { registerDashboardStream } from './stream'
import type { Database } from '../db/client'

type Db = Database['database']

export type DashboardRoutesOptions = {
  database: Db
}

/**
 * `GET /api/v1/dashboard` (`specs/11-dashboard.md` §11.1–§11.2).
 *
 * Guarded by `ticket.read`. Optional sections are resolved per request: `onCall`
 * only with `oncall.read`, `channels` only with `notification.read`. A missing
 * permission makes the section `null` instead of a `403`, so a
 * `reporter_internal` still sees the ticket tiles and the counter.
 */
export const dashboardRoutes = fp<DashboardRoutesOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/dashboard',
      {
        preHandler: requirePermission(database, PERMISSIONS.ticket.read),
      },
      async (request, reply) => {
        const held = await effectivePermissions(request, database)

        const snapshot = await buildDashboardSnapshot(database, {
          now: new Date(),
          includeOnCall: held.includes(PERMISSIONS.oncall.read),
          includeChannels: held.includes(PERMISSIONS.notification.read),
        })

        return reply.send(dashboardSnapshotSchema.parse(snapshot))
      },
    )

    registerDashboardStream(app, { database })
  },
  { name: 'stoerdesk-dashboard' },
)
