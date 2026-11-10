import { describe, expect, it } from 'vitest'

import {
  createWebhookRequestSchema,
  createWebhookResponseSchema,
  updateWebhookRequestSchema,
  WEBHOOK_EVENT_TYPES,
} from '../schemas/webhook'

describe('webhook contracts', () => {
  it('publishes exactly the two subscribed event types', () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual(['ticket.created', 'ticket.status_changed'])
  })

  it('accepts http and https URLs and rejects anything else', () => {
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'https://example.org/hook',
        events: ['ticket.created'],
      }).success,
    ).toBe(true)
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'http://example.org/hook',
        events: ['ticket.created'],
      }).success,
    ).toBe(true)
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'ftp://example.org/hook',
        events: ['ticket.created'],
      }).success,
    ).toBe(false)
  })

  it('needs at least one known event without duplicates', () => {
    expect(
      createWebhookRequestSchema.safeParse({ url: 'https://example.org', events: [] }).success,
    ).toBe(false)
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'https://example.org',
        events: ['ticket.deleted'],
      }).success,
    ).toBe(false)
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'https://example.org',
        events: ['ticket.created', 'ticket.created'],
      }).success,
    ).toBe(false)
  })

  it('defaults the active flag and keeps the secret shape of the create answer', () => {
    const parsed = createWebhookRequestSchema.parse({
      url: 'https://example.org/hook',
      events: ['ticket.status_changed'],
    })

    expect(parsed.active).toBe(true)
    expect(updateWebhookRequestSchema.safeParse({}).success).toBe(true)
    expect(
      createWebhookResponseSchema.safeParse({
        webhook: {
          id: '01900000-0000-7000-8000-000000000000',
          url: 'https://example.org/hook',
          events: ['ticket.created'],
          active: true,
          createdAt: '2026-11-10T00:00:00.000Z',
          updatedAt: '2026-11-10T00:00:00.000Z',
        },
        secret: `whsec_${'a'.repeat(43)}`,
      }).success,
    ).toBe(true)
  })
})
