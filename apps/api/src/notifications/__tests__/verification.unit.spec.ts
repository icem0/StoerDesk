import { describe, expect, it } from 'vitest'

import { loadEnv } from '../../config/env'
import type { Database } from '../../db/client'
import { notificationChannelVerifications } from '../../db/schema'
import {
  ChannelVerificationError,
  confirmNtfyVerification,
  effectiveNtfyConfig,
  requestNtfyVerification,
} from '../verification'

type Db = Database['database']

interface VerificationRow {
  kind: string
  fingerprint: string
  code: string
  expiresAt: Date | null
  verifiedAt: Date | null
}

/**
 * The service reads the channel rows, the verification row and upserts the
 * verification row. The fake implements exactly those chains; the actual
 * configuration logic lives in the unit-tested `readChannelConfiguration`.
 */
function fakeDatabase(config: Record<string, string>): {
  database: Db
  verifications: VerificationRow[]
} {
  const verifications: VerificationRow[] = []
  const channels = [
    { kind: 'ntfy', enabled: true, label: '', config, secret: '' },
  ]

  const database = {
    select: () => {
      let table: unknown
      const chain = {
        from: (next: unknown) => {
          table = next
          return chain
        },
        where: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(
            table === notificationChannelVerifications ? verifications : channels,
          ).then(resolve, reject),
      }

      return chain
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (table !== notificationChannelVerifications) {
            throw new Error('unexpected insert')
          }

          const merged = { ...values, ...set } as unknown as VerificationRow
          const index = verifications.findIndex((row) => row.kind === values.kind)

          if (index === -1) {
            verifications.push(merged)
            return
          }

          verifications[index] = { ...verifications[index], ...merged }
        },
      }),
    }),
  }

  return { database: database as unknown as Db, verifications }
}

const codeOf = (body: string): string => {
  const match = /([A-Z2-9]{6})$/.exec(body)

  if (match?.[1] === undefined) {
    throw new Error(`no code in ${body}`)
  }

  return match[1]
}

function capturingFetch(): {
  fetchImpl: typeof fetch
  sent: { url: string; body: string }[]
} {
  const sent: { url: string; body: string }[] = []

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), body: String(init?.body ?? '') })

    return { ok: true } as Response
  }

  return { fetchImpl: fetchImpl as typeof fetch, sent }
}

describe('ntfy verification (WP-M14-47)', () => {
  it('clears the outbox target until the code was confirmed', async () => {
    const { database } = fakeDatabase({ url: 'https://ntfy.mock', topic: 'office' })
    const env = loadEnv({})

    expect(await effectiveNtfyConfig(database, env, { requireVerified: true })).toBeNull()

    const { fetchImpl, sent } = capturingFetch()
    await requestNtfyVerification(database, env, { fetchImpl })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://ntfy.mock/')

    const code = codeOf(JSON.parse(sent[0]?.body ?? '{}').message as string)
    await confirmNtfyVerification(database, env, code)

    expect(await effectiveNtfyConfig(database, env, { requireVerified: true })).toEqual({
      url: 'https://ntfy.mock',
      topic: 'office',
    })
  })

  it('rejects a wrong code, an expired code and a changed target', async () => {
    const config = { url: 'https://ntfy.mock', topic: 'office' }
    const env = loadEnv({})
    const { database, verifications } = fakeDatabase(config)
    const { fetchImpl, sent } = capturingFetch()

    await requestNtfyVerification(database, env, { fetchImpl })
    const code = codeOf(JSON.parse(sent[0]?.body ?? '{}').message as string)

    await expect(confirmNtfyVerification(database, env, 'WRONG1')).rejects.toMatchObject({
      code: 'verification_code_invalid',
    })

    verifications[0]!.expiresAt = new Date(Date.now() - 1000)
    await expect(confirmNtfyVerification(database, env, code)).rejects.toMatchObject({
      code: 'verification_code_expired',
    })

    config.url = 'https://other.mock'
    verifications[0]!.expiresAt = new Date(Date.now() + 60_000)
    await expect(confirmNtfyVerification(database, env, code)).rejects.toMatchObject({
      code: 'verification_code_invalid',
    })
  })

  it('reports a send failure and leaves no pending code', async () => {
    const { database, verifications } = fakeDatabase({
      url: 'https://ntfy.mock',
      topic: 'office',
    })
    const env = loadEnv({})
    const fetchImpl = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch

    await expect(
      requestNtfyVerification(database, env, { fetchImpl }),
    ).rejects.toBeInstanceOf(ChannelVerificationError)

    expect(verifications[0]?.code).toBe('')
    expect(verifications[0]?.verifiedAt).toBeNull()
  })

  it('refuses a channel without a usable target', async () => {
    const { database } = fakeDatabase({ url: '', topic: '' })

    await expect(
      requestNtfyVerification(database, loadEnv({}), { fetchImpl: capturingFetch().fetchImpl }),
    ).rejects.toMatchObject({ code: 'channel_not_configured' })
  })
})
