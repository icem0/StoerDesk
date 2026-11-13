import { z } from 'zod'

/**
 * The channel configuration API (`specs/10-notifications.md` §11.2, §11.11,
 * WP-M14-05). The secret of a channel is write-only: a request may carry it, an
 * answer never does — it only reports `secretSet` (ADR-0005 rule, §11.13).
 */

export const NOTIFICATION_CHANNEL_KINDS = [
  'signal',
  'matrix',
  'ntfy',
  'email',
  'telegram',
  'webpush',
  'whatsapp',
] as const

export const notificationChannelKindSchema = z.enum(NOTIFICATION_CHANNEL_KINDS)

export type NotificationChannelKind = z.infer<typeof notificationChannelKindSchema>

const channelConfigSchema = z.record(z.string(), z.string())

export const channelConfigurationSchema = z.object({
  kind: notificationChannelKindSchema,
  enabled: z.boolean(),
  label: z.string(),
  /** Public settings of the channel (url, topic, homeserver …). */
  config: channelConfigSchema,
  /** Whether a secret is stored — the secret itself is never answered. */
  secretSet: z.boolean(),
})

export const channelConfigurationListResponseSchema = z.object({
  channels: z.array(channelConfigurationSchema),
})

export const updateChannelConfigurationRequestSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().trim().max(200).optional(),
  config: channelConfigSchema.optional(),
  /** A non-empty value replaces the stored secret; empty or missing leaves it untouched. */
  secret: z.string().max(4096).optional(),
})

export const channelTestResponseSchema = z.object({
  delivered: z.boolean(),
  /** The machine-readable failure code of the adapter; absent on success. */
  code: z.string().optional(),
})

/**
 * The account of a user at one channel (`specs/10-notifications.md` §11.3,
 * WP-M14-08). The secret is write-only: a request may carry it, an answer never
 * does — it only reports `secretSet` (ADR-0005 rule, §11.13).
 */
export const notificationAccountSchema = z.object({
  channel: notificationChannelKindSchema,
  /** The address at the channel (chat id, matrix id, topic, bridge chat id). */
  externalId: z.string(),
  label: z.string(),
  /** Whether a secret is stored — the secret itself is never answered. */
  secretSet: z.boolean(),
})

export const notificationAccountListResponseSchema = z.object({
  accounts: z.array(notificationAccountSchema),
})

export const storeNotificationAccountRequestSchema = z.object({
  channel: notificationChannelKindSchema,
  externalId: z.string().trim().min(1).max(500),
  label: z.string().trim().max(200).optional(),
  /** A non-empty value replaces the stored secret; empty or missing leaves it untouched. */
  secret: z.string().max(4096).optional(),
})

export type ChannelConfiguration = z.infer<typeof channelConfigurationSchema>
export type ChannelConfigurationListResponse = z.infer<
  typeof channelConfigurationListResponseSchema
>
export type UpdateChannelConfigurationRequest = z.infer<
  typeof updateChannelConfigurationRequestSchema
>
export type ChannelTestResponse = z.infer<typeof channelTestResponseSchema>
export type NotificationAccount = z.infer<typeof notificationAccountSchema>
export type NotificationAccountListResponse = z.infer<
  typeof notificationAccountListResponseSchema
>
export type StoreNotificationAccountRequest = z.infer<
  typeof storeNotificationAccountRequestSchema
>
