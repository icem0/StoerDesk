import { describe, expect, it } from 'vitest'

import {
  notificationMessageFilterSchema,
  notificationMessageListResponseSchema,
  notificationMessageRecipientSchema,
  notificationRecipientSummarySchema,
} from '../schemas/notification.js'

/**
 * The contracts of the inbox of the notifications (`specs/10-notifications.md`
 * §11.16, WP-M14-141a): the filter of the message list and the answer with the
 * addressee of every row.
 */
describe('the filter of the message list', () => {
  it('accepts an empty filter', () => {
    expect(notificationMessageFilterSchema.parse({})).toEqual({})
  })

  it('accepts the addressee, the channel, the event, the state and the unread filter', () => {
    const filter = notificationMessageFilterSchema.parse({
      userId: '11111111-1111-4111-8111-111111111111',
      channel: 'ntfy',
      eventType: 'ticket.created',
      state: 'FAILED',
      unread: true,
    })

    expect(filter.channel).toBe('ntfy')
    expect(filter.eventType).toBe('ticket.created')
    expect(filter.state).toBe('FAILED')
    expect(filter.unread).toBe(true)
  })

  it('rejects an unknown channel, an unknown event and a malformed addressee', () => {
    expect(notificationMessageFilterSchema.safeParse({ channel: 'carrier-pigeon' }).success).toBe(
      false,
    )
    expect(notificationMessageFilterSchema.safeParse({ eventType: 'ticket.nonsense' }).success).toBe(
      false,
    )
    expect(notificationMessageFilterSchema.safeParse({ userId: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('the answer of the message list', () => {
  it('fills the recipient of a row and the addressees when they are missing', () => {
    const answer = notificationMessageListResponseSchema.parse({
      messages: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          channel: 'ntfy',
          eventType: 'ticket.created',
          state: 'SENT',
          title: 'ST-0001',
          body: 'normal',
          createdAt: '2026-11-18T09:30:00.000Z',
          readAt: null,
        },
      ],
    })

    expect(answer.messages[0]?.recipient).toBeNull()
    expect(answer.recipients).toEqual([])
  })

  it('carries the addressee of a row and the list of the addressees', () => {
    const recipient = { userId: '33333333-3333-4333-8333-333333333333', name: 'Erika Muster' }
    const answer = notificationMessageListResponseSchema.parse({
      messages: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          channel: 'email',
          eventType: 'ticket.escalated',
          state: 'SENT',
          title: 'ST-0002',
          body: 'high',
          createdAt: '2026-11-18T09:31:00.000Z',
          readAt: '2026-11-18T10:00:00.000Z',
          recipient,
        },
      ],
      recipients: [{ ...recipient, count: 3 }],
    })

    expect(answer.messages[0]?.recipient).toEqual(recipient)
    expect(answer.recipients[0]?.count).toBe(3)
    expect(notificationMessageRecipientSchema.parse(recipient)).toEqual(recipient)
    expect(notificationRecipientSummarySchema.parse({ ...recipient, count: 0 }).count).toBe(0)
  })
})
