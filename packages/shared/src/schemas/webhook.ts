import { z } from 'zod'

/**
 * Webhook endpoints of the external API (`specs/08-objects-api.md` §9.5,
 * ADR-0013). The secret is answered once on create and never listed again.
 */

export const WEBHOOK_EVENT_TYPES = ['ticket.created', 'ticket.status_changed'] as const

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES)

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>

/**
 * The event types a delivery may carry. Beside the two types an endpoint
 * subscribes to, the escalation delivers `ticket.escalated` to the endpoints
 * that the rule of the ticket selected (`specs/07-escalation.md` §7.5,
 * ADR-0017) — the subscription list of an endpoint stays untouched.
 */
export const WEBHOOK_DELIVERY_EVENT_TYPES = [
  ...WEBHOOK_EVENT_TYPES,
  'ticket.escalated',
] as const

export type WebhookDeliveryEventType = (typeof WEBHOOK_DELIVERY_EVENT_TYPES)[number]

const webhookUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value)

        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'invalid_url' },
  )

const webhookEventsSchema = z
  .array(webhookEventTypeSchema)
  .min(1)
  .refine((events) => new Set(events).size === events.length)

export const webhookSummarySchema = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(webhookEventTypeSchema).min(1),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const webhookListResponseSchema = z.object({
  webhooks: z.array(webhookSummarySchema),
})

export const createWebhookRequestSchema = z.object({
  url: webhookUrlSchema,
  events: webhookEventsSchema,
  active: z.boolean().optional().default(true),
})

export const updateWebhookRequestSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: webhookEventsSchema.optional(),
  active: z.boolean().optional(),
})

export const createWebhookResponseSchema = z.object({
  webhook: webhookSummarySchema,
  /** The only time the signing secret is ever answered. */
  secret: z.string().regex(/^whsec_[A-Za-z0-9_-]{43}$/),
})

export type WebhookSummary = z.infer<typeof webhookSummarySchema>
export type WebhookListResponse = z.infer<typeof webhookListResponseSchema>
export type CreateWebhookRequest = z.infer<typeof createWebhookRequestSchema>
export type UpdateWebhookRequest = z.infer<typeof updateWebhookRequestSchema>
export type CreateWebhookResponse = z.infer<typeof createWebhookResponseSchema>
