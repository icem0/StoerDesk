import { describe, expect, it } from 'vitest'

import {
  channelPolicySchema,
  confirmNotificationVerificationRequestSchema,
  notificationAccountSchema,
  notificationComplianceSchema,
  notificationMessageFilterSchema,
  notificationMessageListResponseSchema,
  notificationMessageRecipientSchema,
  notificationRecipientSummarySchema,
  notificationVerificationResponseSchema,
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

/**
 * The contracts of the channels of a user and of the rule of the
 * administration (`specs/10-notifications.md` §11.3, §11.3a, §11.9, ADR-0045).
 */
describe('the rule of the administration', () => {
  it('accepts the required channels and the minimum number', () => {
    const policy = channelPolicySchema.parse({
      requiredChannels: ['webpush', 'ntfy'],
      minimumChannelCount: 2,
    })

    expect(policy.requiredChannels).toEqual(['webpush', 'ntfy'])
    expect(policy.minimumChannelCount).toBe(2)
  })

  it('rejects an unknown channel, a negative number and a count above hundred', () => {
    expect(
      channelPolicySchema.safeParse({ requiredChannels: ['carrier-pigeon'], minimumChannelCount: 0 })
        .success,
    ).toBe(false)
    expect(
      channelPolicySchema.safeParse({ requiredChannels: [], minimumChannelCount: -1 }).success,
    ).toBe(false)
    expect(
      channelPolicySchema.safeParse({ requiredChannels: [], minimumChannelCount: 101 }).success,
    ).toBe(false)
  })
})

describe('the account of a user', () => {
  it('carries the target, the confirmation and the state', () => {
    const account = notificationAccountSchema.parse({
      channel: 'matrix',
      externalId: '@alice:example.org',
      label: '',
      secretSet: true,
      target: '!room:example.org',
      verifiedAt: '2026-11-24T10:00:00.000Z',
      state: 'ready',
    })

    expect(account.target).toBe('!room:example.org')
    expect(account.state).toBe('ready')
  })

  it('rejects an unknown state', () => {
    expect(
      notificationAccountSchema.safeParse({
        channel: 'matrix',
        externalId: '@alice:example.org',
        label: '',
        secretSet: false,
        target: '',
        verifiedAt: null,
        state: 'hopeful',
      }).success,
    ).toBe(false)
  })
})

describe('the compliance of a user', () => {
  it('names the channels, the missing ones and the count', () => {
    const entry = notificationComplianceSchema.parse({
      userId: '11111111-1111-4111-8111-111111111111',
      name: 'Alice',
      channels: [
        { channel: 'ntfy', state: 'ready' },
        { channel: 'webpush', state: 'missing' },
      ],
      missing: ['webpush'],
      channelCount: 1,
      compliant: false,
    })

    expect(entry.missing).toEqual(['webpush'])
    expect(entry.compliant).toBe(false)
  })
})

describe('the confirmation of a channel', () => {
  it('answers the deadline of the pending code and takes the code of the user', () => {
    expect(
      notificationVerificationResponseSchema.parse({ expiresAt: '2026-11-24T10:10:00.000Z' })
        .expiresAt,
    ).toBe('2026-11-24T10:10:00.000Z')
    expect(confirmNotificationVerificationRequestSchema.parse({ code: 'AB12CD' }).code).toBe(
      'AB12CD',
    )
  })

  it('refuses an empty code', () => {
    expect(confirmNotificationVerificationRequestSchema.safeParse({ code: '  ' }).success).toBe(false)
  })
})
