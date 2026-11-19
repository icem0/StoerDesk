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
 * The status of the channels (`specs/10-notifications.md` §11.8, WP-M14-19):
 * per channel the pending rows, the failed rows, the time of the last success
 * and the time of the last failure — the same numbers the dashboard tile reads
 * from the outbox. A failed channel is a warning, never an error of the API.
 */
export const channelStatusItemSchema = z.object({
  name: z.string(),
  lastSentAt: z.iso.datetime().nullable(),
  lastFailedAt: z.iso.datetime().nullable(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
})

export const channelStatusListResponseSchema = z.object({
  channels: z.array(channelStatusItemSchema),
})

export type ChannelStatusItem = z.infer<typeof channelStatusItemSchema>
export type ChannelStatusListResponse = z.infer<typeof channelStatusListResponseSchema>

/**
 * The delivery problems of the channels (`specs/10-notifications.md` §11.8,
 * WP-M14-161a): a channel with failed deliveries that nobody acknowledged.
 *
 * The acknowledgement carries the time of the last quittature — a failure
 * after it opens the problem again, so a solved problem stays solved and a
 * new one is never silent. The times are the times of the failure itself
 * (`updated_at` of the outbox row), not the time the row was queued.
 */
export const deliveryProblemSchema = z.object({
  channel: z.string(),
  /** The failed deliveries of the channel in total. */
  failed: z.number().int().nonnegative(),
  /** The failures that happened after the acknowledgement — the open problem. */
  unacknowledged: z.number().int().nonnegative(),
  /** The time of the last failure; null when the channel never failed. */
  lastFailureAt: z.iso.datetime().nullable(),
  /** The time of the last success; null when the channel never delivered. */
  lastSuccessAt: z.iso.datetime().nullable(),
  /** The machine code of the last failure; never translated text. */
  lastError: z.string().nullable(),
  /** The time of the last quittature; null when nobody acknowledged it. */
  acknowledgedAt: z.iso.datetime().nullable(),
  /** The name of the user that acknowledged the problem the last time. */
  acknowledgedBy: z.string().nullable(),
  /** True while the problem waits for a quittature. */
  open: z.boolean(),
})

/**
 * One lost message: a failed row of the outbox (`specs/10-notifications.md`
 * §11.8). The row names the ticket the message announced — never a contact
 * value, never a photo and never a secret of the channel.
 */
export const deliveryFailureSchema = z.object({
  id: z.uuid(),
  channel: z.string(),
  eventType: z.string(),
  failedAt: z.iso.datetime(),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  /** The ticket the message announced; null for a readiness or a health warning. */
  ticketNo: z.string().nullable(),
})

/** The answer of the delivery problems: the problems and the lost messages. */
export const deliveryProblemsResponseSchema = z.object({
  problems: z.array(deliveryProblemSchema),
  failures: z.array(deliveryFailureSchema),
})

/**
 * The quittature of the problems (`specs/10-notifications.md` §11.8): the named
 * channels, or every open problem when the list is missing or empty.
 */
export const acknowledgeDeliveryRequestSchema = z.object({
  channels: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
})

/** The answer of the quittature: the time and the channels it closed. */
export const acknowledgeDeliveryResponseSchema = z.object({
  acknowledgedAt: z.iso.datetime(),
  channels: z.array(z.string()),
})

export type DeliveryProblem = z.infer<typeof deliveryProblemSchema>
export type DeliveryFailure = z.infer<typeof deliveryFailureSchema>
export type DeliveryProblemsResponse = z.infer<typeof deliveryProblemsResponseSchema>
export type AcknowledgeDeliveryRequest = z.infer<typeof acknowledgeDeliveryRequestSchema>
export type AcknowledgeDeliveryResponse = z.infer<typeof acknowledgeDeliveryResponseSchema>

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
 * The web-push device of a user (`specs/10-notifications.md` §11.1, §11.3,
 * WP-M14-124). A browser subscription is a capability URL plus two keys the
 * push service hands out; the payload itself stays encrypted (RFC 8291), so
 * the server never stores a secret of the user. The endpoint is never echoed
 * by an answer and never logged.
 */
export const webPushSubscriptionRequestSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
})

export const webPushUnsubscribeRequestSchema = z.object({
  endpoint: z.url().max(2000),
})

/**
 * The question whether the server still holds the device of this browser
 * (`specs/10-notifications.md` §11.3, WP-M14-144): the browser knows its own
 * subscription, the server knows its rows — only both together say whether a
 * push can arrive. The endpoint is a capability URL, so it travels in the body
 * of the request and never in the answer.
 */
export const webPushSubscriptionCheckRequestSchema = z.object({
  endpoint: z.url().max(2000),
})

/** The answer of the check: a boolean, never the endpoint itself. */
export const webPushSubscriptionCheckResponseSchema = z.object({
  registered: z.boolean(),
})

/** The own state of the channel: the VAPID public key and the device count. */
export const webPushConfigResponseSchema = z.object({
  /** URL-safe base64 VAPID public key; empty while the channel is not configured. */
  publicKey: z.string(),
  /** How many devices the signed-in user has registered on this server. */
  subscribed: z.boolean(),
  subscriptions: z.number().int().nonnegative(),
})

export const webPushSubscriptionResponseSchema = z.object({
  subscribed: z.literal(true),
})

/**
 * The event types a user selects channels for (`specs/10-notifications.md`
 * §11.4, WP-M14-16, ADR-0021): the four ticket events and the three readiness
 * events. Migration `0039` of WP-M14-27 widens the check of
 * `notification_preferences` to these seven.
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
export type RedeemTelegramLinkCodeRequest = z.infer<typeof redeemTelegramLinkCodeRequestSchema>
export type MatrixLinkingRequest = z.infer<typeof matrixLinkingRequestSchema>

/**
 * The machine-readable parameters of a readiness message (`specs/10-notifications.md`
 * §11.5, WP-M14-28, ADR-0021): pool name, start and end in `Europe/Berlin`
 * formatted from the stored UTC values, shift state and shift id. No photo,
 * no contact data, no translated UI text.
 */
export const oncallShiftMessageSchema = z.object({
  poolName: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  state: z.string().min(1).max(32),
  shiftId: z.uuid(),
})

export type OncallShiftMessage = z.infer<typeof oncallShiftMessageSchema>

export type ChannelConfiguration = z.infer<typeof channelConfigurationSchema>
export type ChannelConfigurationListResponse = z.infer<
  typeof channelConfigurationListResponseSchema
>
export type UpdateChannelConfigurationRequest = z.infer<
  typeof updateChannelConfigurationRequestSchema
>
export type ChannelTestRequest = z.infer<typeof channelTestRequestSchema>
export type ChannelTestResponse = z.infer<typeof channelTestResponseSchema>
export type ChannelVerificationResponse = z.infer<typeof channelVerificationResponseSchema>
export type ConfirmChannelVerificationRequest = z.infer<
  typeof confirmChannelVerificationRequestSchema
>
export type ConfirmChannelVerificationResponse = z.infer<
  typeof confirmChannelVerificationResponseSchema
>
export type NotificationAccount = z.infer<typeof notificationAccountSchema>
export type NotificationAccountListResponse = z.infer<typeof notificationAccountListResponseSchema>
export type StoreNotificationAccountRequest = z.infer<typeof storeNotificationAccountRequestSchema>
export type WebPushSubscriptionRequest = z.infer<typeof webPushSubscriptionRequestSchema>
export type WebPushUnsubscribeRequest = z.infer<typeof webPushUnsubscribeRequestSchema>
export type WebPushSubscriptionCheckRequest = z.infer<
  typeof webPushSubscriptionCheckRequestSchema
>
export type WebPushSubscriptionCheckResponse = z.infer<
  typeof webPushSubscriptionCheckResponseSchema
>
export type WebPushConfigResponse = z.infer<typeof webPushConfigResponseSchema>
export type WebPushSubscriptionResponse = z.infer<typeof webPushSubscriptionResponseSchema>
export type NotificationPreferenceEntry = z.infer<typeof notificationPreferenceSchema>
export type NotificationPreferencesListResponse = z.infer<
  typeof notificationPreferencesListResponseSchema
>
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>

/**
 * One message of a user's notification inbox (`specs/10-notifications.md` §11.8,
 * WP-M14-120a): which channel a message was sent to, whether it arrived, and
 * when. No contact data, no photo, no translated UI text — the UI translates
 * the channel and event-type keys itself.
 *
 * The recipient (WP-M14-141a) is the addressee of the message. It is `null`
 * without the permission `notification.read_all`: the inbox of a user stays
 * personal and never names another user.
 */
export const notificationMessageRecipientSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
})

/**
 * One addressee of the answer of the inbox (WP-M14-141a): the user and the
 * number of the messages of the user under the filter of the answer.
 */
export const notificationRecipientSummarySchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  count: z.number().int().nonnegative(),
})

export const notificationMessageItemSchema = z.object({
  id: z.uuid(),
  channel: z.string(),
  eventType: z.string(),
  state: z.enum(['PENDING', 'SENT', 'FAILED']),
  title: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
  recipient: notificationMessageRecipientSchema.nullable().default(null),
})

export const notificationMessageListResponseSchema = z.object({
  messages: z.array(notificationMessageItemSchema),
  /** The addressees of the filter; empty without the permission. */
  recipients: z.array(notificationRecipientSummarySchema).default([]),
})

/**
 * The filter of the message list (`specs/10-notifications.md` §11.16,
 * WP-M14-141a): the addressee, the channel, the event type, the state of the
 * delivery and the unread messages. The filter of the addressee needs the
 * permission `notification.read_all` for another user; the other filters
 * narrow the own inbox.
 */
export const notificationMessageFilterSchema = z.object({
  userId: z.uuid().optional(),
  channel: notificationChannelKindSchema.optional(),
  eventType: notificationEventTypeSchema.optional(),
  state: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
  unread: z.boolean().optional(),
})

/**
 * The answer of the read receipt of one message (WP-M14-120c): the id of the
 * message and the moment it was marked as read.
 */
export const notificationMessageReadResponseSchema = z.object({
  id: z.uuid(),
  readAt: z.iso.datetime().nullable(),
})

/**
 * The number of the unread messages of the user (WP-M14-120c) — the badge of
 * the bell in the shell.
 */
export const notificationUnreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
})

export type NotificationMessageItem = z.infer<typeof notificationMessageItemSchema>
export type NotificationMessageListResponse = z.infer<
  typeof notificationMessageListResponseSchema
>
export type NotificationMessageRecipient = z.infer<typeof notificationMessageRecipientSchema>
export type NotificationRecipientSummary = z.infer<typeof notificationRecipientSummarySchema>
export type NotificationMessageFilter = z.infer<typeof notificationMessageFilterSchema>
export type NotificationMessageReadResponse = z.infer<
  typeof notificationMessageReadResponseSchema
>
export type NotificationUnreadCountResponse = z.infer<
  typeof notificationUnreadCountResponseSchema
>
