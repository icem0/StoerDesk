import type { Database } from '../../db/client'
import { newNtfyTopic } from '../accounts'
import { pushSubscriptions } from '../../db/schema'
import { personalRecipients, userChannels } from '../receivers'
import { describe, expect, it } from 'vitest'

type DbSelect = Pick<Database['database'], 'select'>

interface AccountRow {
  userId: string
  channel: string
  externalId: string
  target: string
  verifiedAt: Date | null
}

/**
 * No PostgreSQL is involved: the channels of a user are a select over the
 * `notification_accounts` rows with a confirmation and a select over the
 * devices of the user. The fake answers the rows exactly as a database would,
 * so the test proves which channel of a user takes part in a delivery
 * (`specs/10-notifications.md` §11.3a, ADR-0045).
 */
function fakeSelect(accounts: AccountRow[], devices: string[] = []): DbSelect {
  const builder = (rows: Array<Record<string, unknown>> | AccountRow[]) => ({
    limit: async (count: number) => rows.slice(0, count),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  })

  return {
    select: (_columns: unknown) => ({
      from: (table: unknown) => ({
        where: () =>
          builder(
            table === pushSubscriptions
              ? devices.map((userId) => ({ userId, endpoint: `https://push/${userId}` }))
              : accounts.filter((account) => account.verifiedAt !== null),
          ),
      }),
    }),
  } as unknown as DbSelect
}

describe('the topic of a user (ADR-0024 point 6, WP-M14-72)', () => {
  it('creates a random topic with the stoerdesk- prefix and 128 bits', () => {
    const topics = [newNtfyTopic(), newNtfyTopic()]

    for (const topic of topics) {
      expect(topic).toMatch(/^stoerdesk-[0-9a-f]{32}$/)
    }

    expect(topics[0]).not.toBe(topics[1])
  })
})

describe('the channels of a user (ADR-0045)', () => {
  it('answers the confirmed accounts with the target of the user', async () => {
    const recipients = await personalRecipients(
      fakeSelect([
        {
          userId: 'user-a',
          channel: 'ntfy',
          externalId: 'stoerdesk-stored',
          target: '',
          verifiedAt: new Date('2026-11-24T10:00:00.000Z'),
        },
        {
          userId: 'user-a',
          channel: 'matrix',
          externalId: '@alice:example.org',
          target: '!room:example.org',
          verifiedAt: new Date('2026-11-24T10:00:00.000Z'),
        },
      ]),
      ['user-a'],
    )

    expect(recipients).toEqual([
      { userId: 'user-a', channel: 'ntfy', target: 'stoerdesk-stored' },
      { userId: 'user-a', channel: 'matrix', target: '!room:example.org' },
    ])
  })

  it('leaves an account out that was never confirmed', async () => {
    const channels = await userChannels(
      fakeSelect([
        {
          userId: 'user-a',
          channel: 'telegram',
          externalId: '-555111222333',
          target: '',
          verifiedAt: null,
        },
      ]),
      'user-a',
    )

    expect(channels).toEqual([])
  })
})
