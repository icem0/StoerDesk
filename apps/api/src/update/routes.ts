import fp from 'fastify-plugin'

import {
  PERMISSIONS,
  updateCheckResponseSchema,
  updateStartResponseSchema,
  type UpdateCheckResponse,
  type UpdateCommit,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { createGitHubClient, GitHubError } from './github'
import { resolveInstalledVersion } from './installed-version'

/**
 * The admin API of the update control (`specs/18-self-update.md` §18.3–§18.4,
 * ADR-0007).
 *
 * `GET /api/v1/admin/update/check` — the installed version, the newest commit
 * of the branch and the commits behind it. The answer is cached for a minute,
 * so the menu does not spam the GitHub API.
 * `POST /api/v1/admin/update/start` — the check runs again on the server, the
 * deploy webhook is called and the route answers immediately: the deployment
 * replaces this container, so waiting for its end would kill the request.
 *
 * Both routes are guarded with `system.update` and answer `{ code, params }` on
 * an error — never translated text and never a secret. The GitHub token and
 * the deploy token never leave the API.
 */

type Db = Database['database']

export type UpdateRouteEnv = Pick<
  Env,
  | 'GITHUB_REPO'
  | 'GITHUB_BRANCH'
  | 'GITHUB_TOKEN'
  | 'UPDATE_WEBHOOK_URL'
  | 'UPDATE_WEBHOOK_TOKEN'
  | 'GIT_COMMIT'
  | 'VERSION_FILE'
>

export type UpdateRouteOptions = {
  database: Db
  env: UpdateRouteEnv
}

/** How long the answer of the check is reused, in milliseconds. */
export const UPDATE_CHECK_CACHE_MS = 60_000

/** How long a started update blocks a second start, in milliseconds. */
export const UPDATE_START_COOLDOWN_MS = 5 * 60_000

/** The timeout of the webhook call in milliseconds. */
const WEBHOOK_TIMEOUT_MS = 10_000

export const updateRoutes = fp<UpdateRouteOptions>(
  async (app, { database, env }) => {
    const client = createGitHubClient({
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      token: env.GITHUB_TOKEN,
    })

    const installedVersion = resolveInstalledVersion(env)

    let cached: { answer: UpdateCheckResponse; at: number } | null = null
    let lastStart: number | null = null

    /**
     * The newest upstream commit and the commits between the installed version
     * and it. A failed call is not cached, so the next request tries again.
     */
    async function check(): Promise<UpdateCheckResponse> {
      const now = Date.now()

      if (cached !== null && now - cached.at < UPDATE_CHECK_CACHE_MS) {
        return cached.answer
      }

      const latest = await client.latestCommit()
      const current = installedVersion

      let commitsBehind: number | null = null
      let commits: UpdateCommit[] = []

      if (current !== null) {
        const comparison = await client.compare(current, latest.sha)

        if (comparison !== null) {
          commitsBehind = comparison.aheadBy
          commits = comparison.commits
        }
      }

      const answer = updateCheckResponseSchema.parse({
        current,
        latest: latest.sha.slice(0, 7),
        updateAvailable: commitsBehind !== null && commitsBehind > 0,
        commitsBehind,
        commits,
        checkedAt: new Date(now).toISOString(),
      })

      cached = { answer, at: now }

      return answer
    }

    /** The GitHub error of a failed check as the answer of the route. */
    function githubError(error: unknown): { code: string; params: Record<string, never> } | null {
      if (!(error instanceof GitHubError)) {
        return null
      }

      return { code: error.code, params: {} }
    }

    app.get(
      '/api/v1/admin/update/check',
      { preHandler: requirePermission(database, PERMISSIONS.system.update) },
      async (_request, reply) => {
        try {
          return await check()
        } catch (error) {
          const envelope = githubError(error)

          if (envelope === null) {
            throw error
          }

          return reply.code(503).send(envelope)
        }
      },
    )

    app.post(
      '/api/v1/admin/update/start',
      { preHandler: requirePermission(database, PERMISSIONS.system.update) },
      async (_request, reply) => {
        const now = Date.now()

        // A double click must not start two deployments.
        if (lastStart !== null && now - lastStart < UPDATE_START_COOLDOWN_MS) {
          return reply.code(429).send({ code: 'update_rate_limited', params: {} })
        }

        const webhookUrl = env.UPDATE_WEBHOOK_URL.trim()

        if (webhookUrl === '') {
          return reply.code(503).send({ code: 'update_webhook_not_configured', params: {} })
        }

        let answer: UpdateCheckResponse

        try {
          answer = await check()
        } catch (error) {
          const envelope = githubError(error)

          if (envelope === null) {
            throw error
          }

          return reply.code(503).send(envelope)
        }

        if (!answer.updateAvailable) {
          return reply.code(409).send({ code: 'update_no_update_available', params: {} })
        }

        // The body is built by the server: no value of the request reaches the
        // webhook.
        const body = JSON.stringify({
          version: answer.latest,
          current: answer.current,
          requestedAt: new Date(now).toISOString(),
        })

        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-deploy-token': env.UPDATE_WEBHOOK_TOKEN,
            },
            body,
            signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          })

          if (!response.ok) {
            return reply.code(502).send({ code: 'update_webhook_failed', params: {} })
          }
        } catch {
          return reply.code(502).send({ code: 'update_webhook_failed', params: {} })
        }

        lastStart = Date.now()

        return reply.code(202).send(updateStartResponseSchema.parse({ started: true }))
      },
    )
  },
  { name: 'stoerdesk-update-routes' },
)
