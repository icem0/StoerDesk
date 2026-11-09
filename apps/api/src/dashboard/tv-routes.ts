import { createHash } from 'node:crypto'
import fp from 'fastify-plugin'

import {
  dashboardSnapshotSchema,
} from '@stoerdesk/shared'
import { readDashboardSettings, verifyTvToken } from '../settings/dashboard'
import { buildDashboardSnapshot, resolveBurningNow } from './service'
import type { Database } from '../db/client'

type Db = Database['database']

/** Stable pseudonym for a wall display, derived from the object id. */
function objectPseudonym(objectId: string): string {
  return `Object-${createHash('sha256').update(objectId).digest('hex').slice(0, 8)}`
}

/**
 * `GET /api/v1/tv/:token` (`specs/11-dashboard.md` §11.7).
 *
 * Token-protected snapshot for the wall display. No session is required. A
 * wrong, missing or rotated token answers `404 tv_not_found` and reveals no
 * data. The snapshot never carries contact data or channel detail: the on-call
 * phone is nulled and the channels section is `null`. When
 * `dashboard.tv_anonymize` is true, every object name is replaced with a
 * stable pseudonym derived from the object id; ticket numbers, statuses,
 * priorities and deadlines stay visible.
 */
export const tvRoutes = fp<TvRoutesOptions>(
  async (app, { database }) => {
    app.get<{ Params: { token: string } }>(
      '/api/v1/tv/:token',
      async (request, reply) => {
        const token = request.params.token

        const valid = await verifyTvToken(database, token)

        if (!valid) {
          return reply.code(404).send({ code: 'tv_not_found', params: {} })
        }

        const now = new Date()
        const snapshot = await buildDashboardSnapshot(database, {
          now,
          includeOnCall: true,
          includeChannels: false,
        })

        // The wall display never carries contact data or channel detail.
        if (snapshot.tiles.onCall !== null) {
          snapshot.tiles.onCall.phone = null
        }
        snapshot.tiles.channels = null

        const settings = await readDashboardSettings(database)

        const objectIdByTicketNo = new Map(
          (await resolveBurningNow(database)).map((row) => [
            row.ticketNo,
            row.objectId,
          ]),
        )

        if (settings.tvAnonymize) {
          for (const row of snapshot.burningNow) {
            const objectId = objectIdByTicketNo.get(row.ticketNo)

            if (objectId !== undefined) {
              row.objectName = objectPseudonym(objectId)
            }
          }
        }

        return reply.code(200).send(dashboardSnapshotSchema.parse(snapshot))
      },
    )
  },
  { name: 'stoerdesk-tv' },
)

export type TvRoutesOptions = {
  database: Db
}
