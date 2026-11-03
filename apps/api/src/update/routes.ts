import { desc, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'

import {
  PERMISSIONS,
  updateRunResponseSchema,
  updateRunStatusSchema,
  updateRunsResponseSchema,
  updateStatusResponseSchema,
  type AgentRun,
  type UpdateRun as UpdateRunAnswer,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { updateRuns, type UpdateRun as UpdateRunRow } from '../db/schema'
import { createUpdateAgentClient, UpdateAgentError } from './client'

/**
 * Admin API of the host update (`specs/18-self-update.md` §18.4–§18.6,
 * ADR-0006).
 *
 * `GET /api/v1/admin/update/status` — the state of the agent, the known
 * version and the last run; it reconciles a `RUNNING` row with the state of
 * the agent, because the rebuild of the stack replaces the API container while
 * the agent keeps running.
 * `POST /api/v1/admin/update/run` — starts one run; `409` while a run is
 * active, `429` inside the cooldown.
 * `GET /api/v1/admin/update/runs` — the history of the run rows.
 *
 * Every route is guarded with `system.update` and answers `{ code, params }` on
 * an error — never translated text and never a secret.
 */

type Db = Database['database']

export type UpdateRouteEnv = Pick<Env, 'UPDATE_AGENT_URL' | 'UPDATE_AGENT_TOKEN'>

export type UpdateRouteOptions = {
  database: Db
  env: UpdateRouteEnv
}

/** The cooldown between two runs: a host update is not a repeated action. */
export const UPDATE_RUN_COOLDOWN_MS = 60_000

/** How many runs the history answers. */
const RUN_HISTORY_LIMIT = 20

function toRunAnswer(row: UpdateRunRow): UpdateRunAnswer {
  return {
    id: row.id,
    // The column has a check constraint, so the value is always a known status.
    status: updateRunStatusSchema.parse(row.status),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    beforeVersion: row.beforeVersion,
    afterVersion: row.afterVersion,
    errorCode: row.errorCode,
  }
}

export const updateRoutes = fp<UpdateRouteOptions>(
  async (app, { database, env }) => {
    const client = createUpdateAgentClient({
      baseUrl: env.UPDATE_AGENT_URL,
      token: env.UPDATE_AGENT_TOKEN,
    })

    /** The newest run row of the history. */
    async function newestRun(): Promise<UpdateRunRow | undefined> {
      const rows = await database
        .select()
        .from(updateRuns)
        .orderBy(desc(updateRuns.startedAt))
        .limit(1)

      return rows[0]
    }

    /**
     * Reconciles a `RUNNING` row with the last run of the agent: the redeploy
     * of the stack replaces the API container, so the row can outlive the
     * request that wrote it. The API never invents a result the agent did not
     * report.
     */
    async function reconcile(row: UpdateRunRow | undefined, agentRun: AgentRun | null) {
      if (row === undefined || row.status !== 'RUNNING' || agentRun === null) {
        return row
      }

      const startedAt = Date.parse(agentRun.startedAt)
      const belongs =
        row.agentRunId === agentRun.id ||
        (row.agentRunId === null && Number.isFinite(startedAt) && startedAt >= row.startedAt.getTime())

      if (!belongs || agentRun.status === 'RUNNING') {
        return row
      }

      const [updated] = await database
        .update(updateRuns)
        .set({
          status: agentRun.status,
          finishedAt: agentRun.finishedAt === null ? null : new Date(agentRun.finishedAt),
          afterVersion: agentRun.afterVersion,
          errorCode: agentRun.errorCode,
          agentRunId: agentRun.id,
        })
        .where(eq(updateRuns.id, row.id))
        .returning()

      return updated ?? row
    }

    app.get(
      '/api/v1/admin/update/status',
      { preHandler: requirePermission(database, PERMISSIONS.system.update) },
      async () => {
        let agent: { reachable: boolean; state: 'idle' | 'running' | 'failed' | null } = {
          reachable: false,
          state: null,
        }
        let currentVersion: string | null = null
        let agentRun: AgentRun | null = null

        try {
          const status = await client.status()

          agent = { reachable: true, state: status.state }
          currentVersion = status.checkout.version
          agentRun = status.lastRun
        } catch (error) {
          if (!(error instanceof UpdateAgentError)) {
            throw error
          }
        }

        const lastRun = await reconcile(await newestRun(), agentRun)

        return updateStatusResponseSchema.parse({
          agent,
          running: lastRun !== undefined && lastRun.status === 'RUNNING',
          currentVersion,
          lastRun: lastRun === undefined ? null : toRunAnswer(lastRun),
        })
      },
    )

    app.post(
      '/api/v1/admin/update/run',
      { preHandler: requirePermission(database, PERMISSIONS.system.update) },
      async (_request, reply) => {
        const previous = await newestRun()

        if (previous !== undefined && previous.status === 'RUNNING') {
          return reply.code(409).send({ code: 'update_already_running', params: {} })
        }

        if (
          previous !== undefined &&
          Date.now() - previous.startedAt.getTime() < UPDATE_RUN_COOLDOWN_MS
        ) {
          return reply.code(429).send({ code: 'update_rate_limited', params: {} })
        }

        // The row is written before the agent starts: the rebuild replaces this
        // container, so a run that is only written afterwards could be lost.
        const [started] = await database.insert(updateRuns).values({}).returning()

        if (started === undefined) {
          return reply.code(500).send({ code: 'update_run_failed', params: {} })
        }

        try {
          const run = await client.run()

          const [updated] = await database
            .update(updateRuns)
            .set({ agentRunId: run.id, beforeVersion: run.beforeVersion })
            .where(eq(updateRuns.id, started.id))
            .returning()

          return reply
            .code(202)
            .send(updateRunResponseSchema.parse({ run: toRunAnswer(updated ?? started) }))
        } catch (error) {
          if (!(error instanceof UpdateAgentError)) {
            throw error
          }

          await database
            .update(updateRuns)
            .set({
              status: 'FAILED',
              finishedAt: new Date(),
              errorCode: error.code,
            })
            .where(eq(updateRuns.id, started.id))

          const statusCode = error.code === 'update_already_running' ? 409 : 503

          return reply.code(statusCode).send({ code: error.code, params: {} })
        }
      },
    )

    app.get(
      '/api/v1/admin/update/runs',
      { preHandler: requirePermission(database, PERMISSIONS.system.update) },
      async () => {
        const rows = await database
          .select()
          .from(updateRuns)
          .orderBy(desc(updateRuns.startedAt))
          .limit(RUN_HISTORY_LIMIT)

        return updateRunsResponseSchema.parse({ runs: rows.map(toRunAnswer) })
      },
    )
  },
  { name: 'stoerdesk-update-routes' },
)
