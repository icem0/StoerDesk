import { describe, expect, it, vi } from 'vitest'

import { createGitHubClient, GitHubError } from '../github.js'

const token = 'a'.repeat(32)

function commitPayload(sha: string, message: string, date: string) {
  return {
    sha,
    commit: { message, committer: { date }, author: { date } },
  }
}

describe('github client', () => {
  it('refuses to call GitHub without a repository', async () => {
    const client = createGitHubClient(
      { repo: '', branch: 'main', token: '' },
      vi.fn(async () => {
        throw new Error('must not be called')
      }) as unknown as typeof fetch,
    )

    await expect(client.latestCommit()).rejects.toMatchObject({
      code: 'update_not_configured',
    })
  })

  it('reads the newest commit of the branch', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls.push({
          url: String(input),
          headers: (init?.headers as Record<string, string>) ?? {},
        })

        return Response.json(commitPayload('abc1234def', 'fix(api): answer\n\nbody', '2026-11-04T10:00:00Z'))
      }) as unknown as typeof fetch,
    )

    const commit = await client.latestCommit()

    expect(commit).toEqual({
      sha: 'abc1234def',
      message: 'fix(api): answer',
      date: '2026-11-04T10:00:00Z',
    })
    expect(calls[0]?.url).toBe('https://api.github.com/repos/icem0/StoerDesk/commits/main')
    expect(calls[0]?.headers.accept).toBe('application/vnd.github+json')
    // An anonymous request carries no token.
    expect(calls[0]?.headers.authorization).toBeUndefined()
  })

  it('sends the token as a bearer when one is configured', async () => {
    const calls: { headers: Record<string, string> }[] = []
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token },
      vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls.push({ headers: (init?.headers as Record<string, string>) ?? {} })

        return Response.json(commitPayload('abc1234', 'fix(api): answer', '2026-11-04T10:00:00Z'))
      }) as unknown as typeof fetch,
    )

    await client.latestCommit()

    expect(calls[0]?.headers.authorization).toBe(`Bearer ${token}`)
  })

  it('reads the commits of a comparison', async () => {
    const calls: string[] = []
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        calls.push(String(input))

        return Response.json({
          ahead_by: 2,
          commits: [
            commitPayload('aaa1111', 'feat(web): one', '2026-11-04T09:00:00Z'),
            commitPayload('bbb2222', 'fix(api): two', '2026-11-04T08:00:00Z'),
          ],
        })
      }) as unknown as typeof fetch,
    )

    const comparison = await client.compare('v0.0.42', 'abc1234')

    expect(comparison?.aheadBy).toBe(2)
    expect(comparison?.commits).toHaveLength(2)
    expect(comparison?.commits[0]?.message).toBe('feat(web): one')
    expect(calls[0]).toBe('https://api.github.com/repos/icem0/StoerDesk/compare/v0.0.42...abc1234')
  })

  it('answers no comparison when GitHub cannot compare the refs', async () => {
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async () => Response.json({ message: 'Not Found' }, { status: 404 })) as unknown as typeof fetch,
    )

    await expect(client.compare('local-only', 'abc1234')).resolves.toBeNull()
  })

  it('reports an unreachable GitHub', async () => {
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch,
    )

    await expect(client.latestCommit()).rejects.toBeInstanceOf(GitHubError)
    await expect(client.latestCommit()).rejects.toMatchObject({ code: 'update_check_failed' })
  })

  it('names the rate limit of GitHub', async () => {
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async () =>
        Response.json(
          { message: 'API rate limit exceeded' },
          { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
        ),
      ) as unknown as typeof fetch,
    )

    await expect(client.latestCommit()).rejects.toMatchObject({
      code: 'update_github_rate_limited',
    })
  })

  it('reports a malformed answer', async () => {
    const client = createGitHubClient(
      { repo: 'icem0/StoerDesk', branch: 'main', token: '' },
      vi.fn(async () => Response.json({ sha: 42 })) as unknown as typeof fetch,
    )

    await expect(client.latestCommit()).rejects.toMatchObject({ code: 'update_check_failed' })
  })
})
