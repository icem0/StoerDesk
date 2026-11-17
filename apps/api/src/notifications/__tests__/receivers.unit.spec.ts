import type { Database } from '../../db/client'
import { newNtfyTopic } from '../accounts'
import { ntfyRecipients } from '../receivers'
import { describe, expect, it } from 'vitest'

type DbSelect = Pick<Database['database'], 'select'>

/**
 * No PostgreSQL is involved: the recipient read is a select over the
 * `notification_preferences` rows with a left join of the ntfy account of the
 * user. The fake answers the joined rows exactly as a database would, so the
 * test proves which topic the service derives from them.
 */
function fakeSelect(rows: Array<{ userId: string; externalId: string | null }>): DbSelect {
  return {
    select: (_columns: unknown) => ({
      from: (_table: unknown) => ({
        leftJoin: (_other: unknown, _clause: unknown) => ({
          where: async (_clause: unknown) => rows,
        }),
      }),
    }),
  } as unknown as DbSelect
}

describe('the ntfy topic of a user (ADR-0024 point 6, WP-M14-72)', () => {
  it('creates a random topic with the stoerdesk- prefix and 128 bits', () => {
    const topics = [newNtfyTopic(), newNtfyTopic()]

    for (const topic of topics) {
      expect(topic).toMatch(/^stoerdesk-[0-9a-f]{32}$/)
    }

    expect(topics[0]).not.toBe(topics[1])
  })

  it('returns the stored topic of each user and no topic for a user without an account', async () => {
    const recipients = await ntfyRecipients(
      fakeSelect([
        { userId: 'user-a', externalId: 'stoerdesk-stored' },
        { userId: 'user-b', externalId: null },
      ]),
      'ticket.created',
    )

    expect(recipients).toEqual([{ userId: 'user-a', topic: 'stoerdesk-stored' }])
  })

  it('deduplicates the stored topics of the selection', async () => {
    const recipients = await ntfyRecipients(
      fakeSelect([
        { userId: 'user-a', externalId: 'shared-topic' },
        { userId: 'user-b', externalId: 'shared-topic' },
      ]),
      'ticket.created',
    )

    expect(recipients).toEqual([{ userId: 'user-a', topic: 'shared-topic' }])
  })
})
