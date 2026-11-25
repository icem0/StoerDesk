import { describe, expect, it } from 'vitest'

import {
  alarmSettingsSchema,
  channelPolicySchema,
  confirmNotificationVerificationRequestSchema,
  notificationAccountSchema,
  notificationComplianceSchema,
  notificationDeliveryAttemptFilterSchema,
  notificationDeliveryAttemptListResponseSchema,
  notificationItemFilterSchema,
  notificationItemListResponseSchema,
  notificationMuteSchema,
  notificationRecipientSummarySchema,
  notificationVerificationResponseSchema,
} from '../schemas/notification.js'

/**
 * The contracts of the **task** of a user and of the **protocol** of the
 * delivery (`specs/10-notifications.md` §11.16, §11.18, ADR-0052).
 */
describe('the task of a user', () => {
  it('accepts an empty filter and the event type with the unread filter', () => {
    expect(notificationItemFilterSchema.parse({})).toEqual({})

    const filter = notificationItemFilterSchema.parse({
      eventType: 'ticket.assigned',
      unread: true,
    })

    expect(filter.eventType).toBe('ticket.assigned')
    expect(filter.unread).toBe(true)
  })

  it('refuses an empty event type', () => {
    expect(notificationItemFilterSchema.safeParse({ eventType: '' }).success).toBe(false)
  })

  it('carries the params of the task and the receipt of the user', () => {
    const answer = notificationItemListResponseSchema.parse({
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          eventType: 'ticket.assigned',
          params: { ticketNo: 'ST-0001', priority: 'normal' },
          ticketNo: 'ST-0001',
          shiftId: null,
          createdAt: '2026-11-25T09:00:00.000Z',
          readAt: null,
        },
      ],
    })

    expect(answer.items[0]?.params).toEqual({ ticketNo: 'ST-0001', priority: 'normal' })
    expect(answer.items[0]?.ticketNo).toBe('ST-0001')
    expect(answer.items[0]?.readAt).toBeNull()
  })
})

describe('the protocol of the delivery', () => {
  it('accepts the recipient, the channel, the event and the state', () => {
    const filter = notificationDeliveryAttemptFilterSchema.parse({
      userId: '11111111-1111-4111-8111-111111111111',
      channel: 'ntfy',
      eventType: 'ticket.created',
      state: 'FAILED',
    })

    expect(filter.channel).toBe('ntfy')
    expect(filter.state).toBe('FAILED')
  })

  it('refuses an unknown channel and an unknown state', () => {
    expect(
      notificationDeliveryAttemptFilterSchema.safeParse({ channel: 'carrier-pigeon' }).success,
    ).toBe(false)
    expect(notificationDeliveryAttemptFilterSchema.safeParse({ state: 'SENDING' }).success).toBe(
      false,
    )
  })

  it('carries the addressee of an attempt and the list of the addressees', () => {
    const recipient = { userId: '33333333-3333-4333-8333-333333333333', name: 'Erika Muster' }
    const answer = notificationDeliveryAttemptListResponseSchema.parse({
      attempts: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          recipient,
          eventType: 'ticket.escalated',
          channel: 'email',
          state: 'SENT',
          title: 'ST-0002',
          errorCode: null,
          attempts: 1,
          createdAt: '2026-11-25T09:31:00.000Z',
          updatedAt: '2026-11-25T09:31:01.000Z',
        },
      ],
      recipients: [{ ...recipient, count: 3 }],
    })

    expect(answer.attempts[0]?.recipient).toEqual(recipient)
    expect(answer.recipients[0]?.count).toBe(3)
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

/**
 * The contracts of the alarm of the instance (`specs/10-notifications.md`
 * §11.17, ADR-0048).
 */
describe('the alarm of the instance', () => {
  it('accepts the sound and the interval of its repetition', () => {
    const settings = alarmSettingsSchema.parse({ toneEnabled: true, repeatSeconds: 60 })

    expect(settings.toneEnabled).toBe(true)
    expect(settings.repeatSeconds).toBe(60)
  })

  it('refuses an interval below 15 seconds, above 600 seconds and a broken number', () => {
    expect(alarmSettingsSchema.safeParse({ toneEnabled: true, repeatSeconds: 5 }).success).toBe(
      false,
    )
    expect(alarmSettingsSchema.safeParse({ toneEnabled: true, repeatSeconds: 900 }).success).toBe(
      false,
    )
    expect(alarmSettingsSchema.safeParse({ toneEnabled: true, repeatSeconds: 60.5 }).success).toBe(
      false,
    )
  })

  it('accepts the end of the silence and the empty silence', () => {
    expect(notificationMuteSchema.parse({ mutedUntil: '2026-11-24T12:00:00.000Z' }).mutedUntil).toBe(
      '2026-11-24T12:00:00.000Z',
    )
    expect(notificationMuteSchema.parse({ mutedUntil: null }).mutedUntil).toBeNull()
  })
})
