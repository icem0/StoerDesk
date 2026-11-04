/**
 * Read-only client of the GitHub REST API for the update check
 * (`specs/18-self-update.md` §18.3, ADR-0007).
 *
 * Two calls only: the newest commit of the branch and the comparison of two
 * refs. The client never writes anything, never follows a redirect of another
 * host and never sends the token anywhere but `api.github.com`. The token
 * raises the rate limit of the anonymous requests; it never appears in an
 * error, an answer or a log line.
 */

export interface GitHubConfig {
  /** The upstream repository as `owner/repo`. */
  repo: string
  /** The branch that carries the newest sources. */
  branch: string
  /** Optional personal access token; empty means an anonymous request. */
  token: string
}

export type GitHubErrorCode =
  | 'update_not_configured'
  | 'update_check_failed'
  | 'update_github_rate_limited'

export class GitHubError extends Error {
  readonly code: GitHubErrorCode

  constructor(code: GitHubErrorCode, message: string) {
    super(message)
    this.name = 'GitHubError'
    this.code = code
  }
}

/** One commit of the upstream repository. */
export interface GitHubCommit {
  sha: string
  /** The subject — the first line of the commit message. */
  message: string
  /** The commit date in UTC, ISO 8601. */
  date: string
}

/** The commits between two refs. */
export interface GitHubComparison {
  aheadBy: number
  commits: GitHubCommit[]
}

export interface GitHubClient {
  /** The newest commit of the configured branch. */
  latestCommit(): Promise<GitHubCommit>
  /**
   * The commits between `base` and `head`. `null` when GitHub cannot compare
   * the two refs — the installed version is then not part of the upstream
   * history, which is no error but an unknown state.
   */
  compare(base: string, head: string): Promise<GitHubComparison | null>
}

const API_BASE_URL = 'https://api.github.com'

/** The timeout of one call in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The first line of a commit message is its subject. */
function subjectOf(message: string): string {
  const [first] = message.split('\n')

  return (first ?? '').trim()
}

/** Reads one commit of the GitHub payload; `null` for an unexpected shape. */
function readCommit(value: unknown): GitHubCommit | null {
  if (!isRecord(value)) {
    return null
  }

  const sha = value.sha
  const commit = value.commit

  if (typeof sha !== 'string' || sha === '' || !isRecord(commit)) {
    return null
  }

  const message = commit.message
  const committer = isRecord(commit.committer) ? commit.committer : null
  const author = isRecord(commit.author) ? commit.author : null
  const date = committer?.date ?? author?.date

  if (typeof message !== 'string' || typeof date !== 'string') {
    return null
  }

  return { sha, message: subjectOf(message), date }
}

export function createGitHubClient(
  config: GitHubConfig,
  fetchImpl: typeof fetch = fetch,
): GitHubClient {
  const repo = config.repo.trim()
  const branch = config.branch.trim() === '' ? 'main' : config.branch.trim()
  const token = config.token.trim()

  /** `owner/repo` of the upstream repository; empty disables the client. */
  const repoPath = (() => {
    const parts = repo.split('/')

    if (parts.length !== 2) {
      return ''
    }

    const [owner, name] = parts

    if (owner === undefined || name === undefined || owner === '' || name === '') {
      return ''
    }

    return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
  })()

  async function get(path: string): Promise<Response> {
    if (repoPath === '') {
      throw new GitHubError('update_not_configured', 'GITHUB_REPO is not configured')
    }

    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'StoerDesk',
      'x-github-api-version': '2022-11-28',
    }

    if (token !== '') {
      headers.authorization = `Bearer ${token}`
    }

    try {
      return await fetchImpl(`${API_BASE_URL}${path}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      })
    } catch {
      // The cause may carry the URL but never the token; the message stays generic.
      throw new GitHubError('update_check_failed', 'GitHub is not reachable')
    }
  }

  async function json(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new GitHubError('update_check_failed', 'GitHub answered no JSON')
    }
  }

  /** A refused call: the rate limit of the API is named separately. */
  function refuse(response: Response): GitHubError {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const limited = response.status === 429 || (response.status === 403 && remaining === '0')

    if (limited) {
      return new GitHubError('update_github_rate_limited', 'the GitHub rate limit is reached')
    }

    return new GitHubError('update_check_failed', `GitHub answered ${response.status}`)
  }

  return {
    async latestCommit() {
      const response = await get(`/repos/${repoPath}/commits/${encodeURIComponent(branch)}`)

      if (!response.ok) {
        throw refuse(response)
      }

      const commit = readCommit(await json(response))

      if (commit === null) {
        throw new GitHubError('update_check_failed', 'GitHub answered an unexpected commit')
      }

      return commit
    },

    async compare(base, head) {
      const path = `/repos/${repoPath}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
      const response = await get(path)

      if (response.status === 404) {
        // The installed version is not part of the upstream history: the two
        // refs cannot be compared, which is a state and not a failure.
        return null
      }

      if (!response.ok) {
        throw refuse(response)
      }

      const payload = await json(response)

      if (!isRecord(payload) || typeof payload.ahead_by !== 'number') {
        throw new GitHubError('update_check_failed', 'GitHub answered an unexpected comparison')
      }

      const commits: GitHubCommit[] = []

      if (Array.isArray(payload.commits)) {
        for (const entry of payload.commits) {
          const commit = readCommit(entry)

          if (commit !== null) {
            commits.push(commit)
          }
        }
      }

      return { aheadBy: payload.ahead_by, commits }
    },
  }
}
