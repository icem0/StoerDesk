import { describe, expect, it, vi } from 'vitest'

import { createUpdateAgentClient, UpdateAgentError } from '../client.js'

const token = 'a'.repeat(32)

function failingFetch(error: unknown): typeof fetch {
  return vi.fn(async () => {
    throw error
  }) as unknown as typeof fetch
}

describe('update agent client', () => {
  it('refuses to call the agent without a token', async () => {
    const client = createUpdateAgentClient(
      { baseUrl: 'http://update-agent:8080', token: '' },
      failingFetch(new Error('must not be called')),
    )

    await expect(client.status()).rejects.toMatchObject({
      code: 'update_agent_not_configured',
    })
  })

  it('reports an unreachable agent', async () => {
    const client = createUpdateAgentClient(
      { baseUrl: 'http://update-agent:8080', token },
      failingFetch(new Error('ECONNREFUSED')),
    )

    await expect(client.status()).rejects.toBeInstanceOf(UpdateAgentError)
    await expect(client.status()).rejects.toMatchObject({ code: 'update_agent_unreachable' })
  })

  it('reports a malformed answer', async () => {
    const client = createUpdateAgentClient(
      { baseUrl: 'http://update-agent:8080', token },
      vi.fn(async () =>
        Response.json({ state: 'unknown', checkout: {} }),
      ) as unknown as typeof fetch,
    )

    await expect(client.status()).rejects.toMatchObject({ code: 'update_agent_bad_response' })
  })

  it('reads the status of the agent', async () => {
    const calls: { url: string; authorization: string | null }[] = []
    const client = createUpdateAgentClient(
      { baseUrl: 'http://update-agent:8080/', token },
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls.push({
          url: String(input),
          authorization: (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
        })

        return Response.json({
          state: 'idle',
          checkout: { version: 'v0.1.99', commit: 'abc1234' },
          lastRun: null,
        })
      }) as unknown as typeof fetch,
    )

    const status = await client.status()

    expect(status.state).toBe('idle')
    expect(status.checkout.version).toBe('v0.1.99')
    expect(calls[0]).toEqual({
      url: 'http://update-agent:8080/status',
      authorization: `Bearer ${token}`,
    })
  })

  it('maps a conflict of the agent to update_already_running', async () => {
    const client = createUpdateAgentClient(
      { baseUrl: 'http://update-agent:8080', token },
      vi.fn(async () => Response.json({ code: 'update_already_running' }, { status: 409 })) as unknown as typeof fetch,
    )

    await expect(client.run()).rejects.toMatchObject({ code: 'update_already_running' })
  })
})
