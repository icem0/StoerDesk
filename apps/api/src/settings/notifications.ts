import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  PERMISSIONS,
  minimumChannelsResponseSchema,
  notificationChannelKindSchema,
  type NotificationChannelKind,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { configuredChannels } from '../notifications/channels'

/** The settings row that holds the mandatory minimum channels of critical tickets. */
const MINIMUM_CHANNELS_KEY = 'notifications.minimum_channels'

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>

const minimumChannelsSchema = z.object({
  channels: z.array(notificationChannelKindSchema).max(100),
})

export type MinimumChannels = { channels: NotificationChannelKind[] }

/** The channel kinds every critical ticket is notified through. Empty when unset. */
export async function readMinimumChannels(database: DbSelect): Promise<string[]> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, MINIMUM_CHANNELS_KEY))
    .limit(1)

  const value = rows[0]?.value

  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

/** Replaces the mandatory minimum channels of critical tickets. */
export async function storeMinimumChannels(
  database: Db,
  channels: string[],
): Promise<void> {
  await database
    .insert(settings)
    .values({ key: MINIMUM_CHANNELS_KEY, value: channels })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: channels, updatedAt: new Date() },
    })
}

/**
 * `GET/PUT /api/v1/settings/notifications/minimum-channels` (`specs/10-notifications.md`
 * §11.4, §11.9, PLAN.md §12, WP-M14-18).
 *
 * `GET` — `settings.read`, answers the channel kinds of `notifications.minimum_channels`.
 * `PUT` — `settings.write`, replaces them. Every named channel must be configured
 * (`configuredChannels(env)`), otherwise the request is refused with
 * `422 invalid_request` so the setting never promises a delivery that cannot happen.
 */
export const settingsNotificationsRoutes = fp<{ database: Db; env: Env }>(
  async (app, { database, env }) => {
    const configured = new Set(
      (await configuredChannels(env)).map((channel) => channel.name),
    )

    app.get(
      '/api/v1/settings/notifications/minimum-channels',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () =>
        minimumChannelsResponseSchema.parse({
          channels: await readMinimumChannels(database),
        }),
    )

    app.put(
      '/api/v1/settings/notifications/minimum-channels',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = minimumChannelsSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const unknown = parsed.data.channels.filter((channel) => !configured.has(channel))

        if (unknown.length > 0) {
          return reply.code(422).send({
            code: 'invalid_request',
            params: { fields: ['channels'] },
          })
        }

        await storeMinimumChannels(database, parsed.data.channels)

        return minimumChannelsResponseSchema.parse({
          channels: await readMinimumChannels(database),
        })
      },
    )
  },
  { name: 'stoerdesk-settings-notifications' },
)
