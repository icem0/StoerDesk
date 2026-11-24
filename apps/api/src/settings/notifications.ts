import { eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  PERMISSIONS,
  alarmSettingsSchema,
  channelPolicySchema,
  minimumChannelsResponseSchema,
  notificationChannelKindSchema,
  type AlarmSettings,
  type ChannelPolicy,
  type NotificationChannelKind,
} from '@stoerdesk/shared'
import { requirePermission } from '../auth/requirePermission'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { configuredChannels } from '../notifications/channels'

/**
 * The rule of the administration (`specs/10-notifications.md` §11.9, ADR-0045):
 * the settings rows `notifications.required_channels` and
 * `notifications.minimum_channel_count`.
 *
 * `GET` — `settings.read`, answers the required channels and the minimum
 * number of channels.
 * `PUT` — `settings.write`, replaces them. Every named channel must be
 * configured (`configuredChannels(env)`) and may not be `signal` — a channel
 * without an address of the user is a requirement no user could ever fulfil,
 * so it is refused with `422 invalid_request`.
 *
 * The former setting `notifications.minimum_channels` (the mandatory channels
 * of the critical tickets) leaves the product with WP-M24-18 — its route stays
 * until the administration page reads the new rule.
 */

/** The settings row that holds the required channels of every user. */
export const REQUIRED_CHANNELS_KEY = 'notifications.required_channels'

/** The settings row that holds the minimum number of channels of a user. */
export const MINIMUM_CHANNEL_COUNT_KEY = 'notifications.minimum_channel_count'

/** The settings row that holds the mandatory channels of the critical tickets. */
const MINIMUM_CHANNELS_KEY = 'notifications.minimum_channels'

/** The settings row that holds the sound of the installation (§11.17). */
export const ALARM_TONE_ENABLED_KEY = 'notifications.alarm_tone_enabled'

/** The settings row that holds the interval of the repetition of the sound. */
export const ALARM_REPEAT_SECONDS_KEY = 'notifications.alarm_repeat_seconds'

/** The sound of the installation is on by default — the office alarms. */
const DEFAULT_ALARM_TONE_ENABLED = true

/** The interval of the repetition of the sound: one minute by default. */
const DEFAULT_ALARM_REPEAT_SECONDS = 60

type Db = Database['database']
type DbSelect = Pick<Db, 'select'>
/** The writer of a settings row — the database itself or its transaction. */
type DbWriter = Pick<Db, 'insert'>

const minimumChannelsSchema = z.object({
  channels: z.array(notificationChannelKindSchema).max(100),
})

/** Reads the value of a settings row; a missing row is `undefined`. */
async function readSetting(database: DbSelect, key: string): Promise<unknown> {
  const rows = await database
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)

  return rows[0]?.value
}

/** Writes the value of a settings row. */
async function writeSetting(database: DbWriter, key: string, value: unknown): Promise<void> {
  await database
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
}

/**
 * The rule of the administration: the channels every user must have set up and
 * the number of channels a user must have set up in total. Both are empty resp.
 * `0` by default — the rule is off until the admin decides.
 */
export async function readChannelPolicy(database: DbSelect): Promise<ChannelPolicy> {
  const [channels, count] = await Promise.all([
    readSetting(database, REQUIRED_CHANNELS_KEY),
    readSetting(database, MINIMUM_CHANNEL_COUNT_KEY),
  ])

  return {
    requiredChannels: (Array.isArray(channels)
      ? channels.filter((item): item is string => typeof item === 'string')
      : []) as NotificationChannelKind[],
    minimumChannelCount:
      typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0,
  }
}

/** Replaces the rule of the administration. */
export async function storeChannelPolicy(database: Db, policy: ChannelPolicy): Promise<void> {
  await database.transaction(async (tx) => {
    await writeSetting(tx, REQUIRED_CHANNELS_KEY, policy.requiredChannels)
    await writeSetting(tx, MINIMUM_CHANNEL_COUNT_KEY, policy.minimumChannelCount)
  })
}

/**
 * The alarm of the installation (`specs/10-notifications.md` §11.17, ADR-0048):
 * whether it alarms with a sound and how often the sound comes again while
 * unhandled messages exist. Both rows have a default, so an installation
 * without them alarms anyway.
 */
export async function readAlarmSettings(database: DbSelect): Promise<AlarmSettings> {
  const [tone, repeat] = await Promise.all([
    readSetting(database, ALARM_TONE_ENABLED_KEY),
    readSetting(database, ALARM_REPEAT_SECONDS_KEY),
  ])

  return {
    toneEnabled:
      typeof tone === 'boolean' ? tone : DEFAULT_ALARM_TONE_ENABLED,
    repeatSeconds:
      typeof repeat === 'number' && Number.isInteger(repeat) && repeat >= 15 && repeat <= 600
        ? repeat
        : DEFAULT_ALARM_REPEAT_SECONDS,
  }
}

/** Replaces the alarm of the installation. */
export async function storeAlarmSettings(
  database: Db,
  alarm: AlarmSettings,
): Promise<void> {
  await database.transaction(async (tx) => {
    await writeSetting(tx, ALARM_TONE_ENABLED_KEY, alarm.toneEnabled)
    await writeSetting(tx, ALARM_REPEAT_SECONDS_KEY, alarm.repeatSeconds)
  })
}

/** The channel kinds every critical ticket is notified through. */
export async function readMinimumChannels(database: DbSelect): Promise<string[]> {
  const value = await readSetting(database, MINIMUM_CHANNELS_KEY)

  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

/** Replaces the mandatory minimum channels of critical tickets. */
export async function storeMinimumChannels(database: Db, channels: string[]): Promise<void> {
  await writeSetting(database, MINIMUM_CHANNELS_KEY, channels)
}

/**
 * `GET/PUT /api/v1/settings/notifications/channel-policy` (`specs/10-notifications.md`
 * §11.9, §11.11, WP-M24-04).
 */
export const settingsNotificationsRoutes = fp<{ database: Db; env: Env }>(
  async (app, { database, env }) => {
    const configured = new Set(
      (await configuredChannels(env)).map((channel) => channel.name),
    )

    app.get(
      '/api/v1/settings/notifications/channel-policy',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => channelPolicySchema.parse(await readChannelPolicy(database)),
    )

    app.put(
      '/api/v1/settings/notifications/channel-policy',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = channelPolicySchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        const unknown = parsed.data.requiredChannels.filter(
          (channel) => !configured.has(channel),
        )

        // `signal` has no address of the user — a requirement no user could
        // ever fulfil is a lie in the administration (ADR-0045).
        const instanceOnly = parsed.data.requiredChannels.filter(
          (channel: NotificationChannelKind) => channel === 'signal',
        )

        if (unknown.length > 0 || instanceOnly.length > 0) {
          return reply.code(422).send({
            code: 'invalid_request',
            params: { fields: ['requiredChannels'] },
          })
        }

        await storeChannelPolicy(database, parsed.data)

        return channelPolicySchema.parse(await readChannelPolicy(database))
      },
    )

    /**
     * `GET/PUT /api/v1/settings/notifications/alarm` (`specs/10-notifications.md`
     * §11.17, ADR-0048): the sound of the installation and the interval of its
     * repetition. The interval governs the **sound only** — the visual alarm
     * is a state, not a repetition.
     */
    app.get(
      '/api/v1/settings/notifications/alarm',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => alarmSettingsSchema.parse(await readAlarmSettings(database)),
    )

    app.put(
      '/api/v1/settings/notifications/alarm',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = alarmSettingsSchema.safeParse(request.body)

        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]

          return reply.code(400).send({ code: 'invalid_request', params: { fields } })
        }

        await storeAlarmSettings(database, parsed.data)

        return alarmSettingsSchema.parse(await readAlarmSettings(database))
      },
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
