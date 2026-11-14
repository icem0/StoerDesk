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
  /**
   * True once the target was reached with a one-time code and the code was
   * entered back (§11.2, WP-M14-47). Until then the channel is not
   * "configured", even if all settings are present.
   */
  verified: z.boolean(),
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

export const channelTestRequestSchema = z.object({
  /** Optional target for the test message, for example an ntfy test topic. */
  topic: z.string().trim().min(1).max(500).optional(),
})

export const channelTestResponseSchema = z.object({
  delivered: z.boolean(),
  /** The machine-readable failure code of the adapter; absent on success. */
  code: z.string().optional(),
})

/**
 * The verification of a channel target (§11.2, WP-M14-47): request a one-time
 * code that is sent to the channel, then confirm it. Only a confirmed target
 * appears as configured and is used for ticket notifications.
 */
export const channelVerificationResponseSchema = z.object({
  /** Deadline of the pending code; the code itself is never in the answer. */
  expiresAt: z.string(),
})

export const confirmChannelVerificationRequestSchema = z.object({
  code: z.string().trim().min(1).max(20),
})

export const confirmChannelVerificationResponseSchema = z.object({
  verified: z.literal(true),
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

/**
 * The event types a user selects channels for (`specs/10-notifications.md`
 * §11.4, WP-M14-16, ADR-0021): the four ticket events and the three readiness
 * events. The check of `notification_preferences` still names the four ticket
 * types — migration `0034` of WP-M14-27 widens it to these seven.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'ticket.created',
  'ticket.assigned',
  'ticket.escalated',
  'ticket.resolved',
  'oncall.assigned',
  'oncall.swap_requested',
  'oncall.unconfirmed_reminder',
] as const

export const notificationEventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES)

export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>

/**
 * One row of the selection of a user (`specs/10-notifications.md` §11.4,
 * WP-M14-16): one row per event type and channel of `notification_preferences`.
 */
export const notificationPreferenceSchema = z.object({
  eventType: notificationEventTypeSchema,
  channel: notificationChannelKindSchema,
})

export const notificationPreferencesListResponseSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
})

export const updateNotificationPreferencesRequestSchema = z.object({
  /** The complete selection; it replaces the rows of the user. */
  preferences: z.array(notificationPreferenceSchema).max(100),
})

/**
 * The Telegram linking of a user (`specs/10-notifications.md` §11.3, §11.11,
 * WP-M14-09). The code is bound to the requesting user, valid for ten minutes
 * and used once; the answer carries the code and its deadline only — the
 * settings row behind it stays write-only.
 */
export const telegramLinkCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
})

export const redeemTelegramLinkCodeRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
})

/**
 * The Matrix linking of a user (`specs/10-notifications.md` §11.3, §11.11,
 * WP-M14-11): the homeserver, the matrix id and the access token are verified
 * against the homeserver before the account is stored. The token is write-only:
 * the request may carry it, an answer never does — the answer is a
 * `notificationAccountSchema` with `secretSet`.
 */
export const matrixLinkingRequestSchema = z.object({
  homeserver: z.string().trim().min(1).max(500),
  matrixId: z.string().trim().min(1).max(500),
  accessToken: z.string().trim().min(1).max(4096),
})

export type TelegramLinkCodeResponse = z.infer<typeof telegramLinkCodeResponseSchema>
export type RedeemTelegramLinkCodeRequest = z.infer<
  typeof redeemTelegramLinkCodeRequestSchema
>
export type MatrixLinkingRequest = z.infer<typeof matrixLinkingRequestSchema>

export type ChannelConfiguration = z.infer<typeof channelConfigurationSchema>
export type ChannelConfigurationListResponse = z.infer<
  typeof channelConfigurationListResponseSchema
>
export type UpdateChannelConfigurationRequest = z.infer<
  typeof updateChannelConfigurationRequestSchema
>
export type ChannelTestRequest = z.infer<typeof channelTestRequestSchema>
export type ChannelTestResponse = z.infer<typeof channelTestResponseSchema>
export type ChannelVerificationResponse = z.infer<
  typeof channelVerificationResponseSchema
>
export type ConfirmChannelVerificationRequest = z.infer<
  typeof confirmChannelVerificationRequestSchema
>
export type ConfirmChannelVerificationResponse = z.infer<
  typeof confirmChannelVerificationResponseSchema
>
export type NotificationAccount = z.infer<typeof notificationAccountSchema>
export type NotificationAccountListResponse = z.infer<
  typeof notificationAccountListResponseSchema
>
export type StoreNotificationAccountRequest = z.infer<
  typeof storeNotificationAccountRequestSchema
>
export type NotificationPreferenceEntry = z.infer<typeof notificationPreferenceSchema>
export type NotificationPreferencesListResponse = z.infer<
  typeof notificationPreferencesListResponseSchema
>
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>
