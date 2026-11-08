import { and, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'

import {
  confirmShiftRequestSchema,
  createShiftRequestSchema,
  generateShiftsRequestSchema,
  generateShiftsResponseSchema,
  oncallShiftSchema,
  oncallSettingsResponseSchema,
  PERMISSIONS,
  shiftListResponseSchema,
  updateOncallSettingsRequestSchema,
  updateShiftRequestSchema,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import { loadEnv } from '../config/env'
import type { Database } from '../db/client'
import { oncallPools, oncallShifts, users } from '../db/schema'
import { createShift, deleteShift, generateShifts, updateShift } from './service'
import { confirmShift, declineShift } from './confirm'
import { resolveDefaultPool } from './coupling'
import { serializeIcal, verifyIcalToken } from './ical'
import { readOncallSettings, writeOncallSettings } from './settings'
import { swapRoutes } from './swap-routes'

type Db = Database['database']

const MAX_RANGE_DAYS = 366
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000

// The reason length is checked in the service, after existence and state (409 first).
const declineBodySchema = z.object({
  reason: z.string().optional(),
  clientUuid: z.string().uuid().optional(),
})

function invalidRequest(fields: string[]) {
  return { code: 'invalid_request', params: { fields } as Record<string, unknown> }
}

function parseUuidParam(value: unknown): string | null {
  return typeof value === 'string' && z.uuid().safeParse(value).success ? value : null
}

function shiftRow(row: {
  id: string
  poolId: string
  userId: string | null
  state: string
  startsAt: Date
  endsAt: Date
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    poolId: row.poolId,
    userId: row.userId,
    state: row.state,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function requireShift(database: Db, shiftId: string) {
  const [shift] = await database
    .select({
      id: oncallShifts.id,
      poolId: oncallShifts.poolId,
      userId: oncallShifts.userId,
      state: oncallShifts.state,
      startsAt: oncallShifts.startsAt,
      endsAt: oncallShifts.endsAt,
      createdAt: oncallShifts.createdAt,
      updatedAt: oncallShifts.updatedAt,
    })
    .from(oncallShifts)
    .where(eq(oncallShifts.id, shiftId))
    .limit(1)

  if (shift === undefined) {
    throw { statusCode: 404, code: 'oncall_shift_not_found', params: { fields: ['id'] } }
  }

  return shiftRow(shift)
}

export type OncallRoutesOptions = {
  database: Db
}

export const oncallRoutes = fp<OncallRoutesOptions>(
  async (app, { database }) => {
    // Public: the signed token is the only authorization (ADR-0011 decision 5).
    app.get<{ Params: { token: string } }>(
      '/api/v1/oncall/ical/:token.ics',
      async (request, reply) => {
        const notFound = { code: 'ical_not_found', params: {} }
        const userId = verifyIcalToken(request.params.token, loadEnv().SESSION_SECRET)

        if (userId === null) {
          return reply.code(404).send(notFound)
        }

        const [user] = await database
          .select({ locale: users.locale })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)

        if (user === undefined) {
          return reply.code(404).send(notFound)
        }

        const now = Date.now()
        const from = new Date(now - 30 * 24 * 60 * 60 * 1000)
        const to = new Date(now + 180 * 24 * 60 * 60 * 1000)

        const rows = await database
          .select({
            id: oncallShifts.id,
            startsAt: oncallShifts.startsAt,
            endsAt: oncallShifts.endsAt,
            updatedAt: oncallShifts.updatedAt,
            poolName: oncallPools.name,
          })
          .from(oncallShifts)
          .innerJoin(oncallPools, eq(oncallPools.id, oncallShifts.poolId))
          .where(
            and(
              eq(oncallShifts.userId, userId),
              inArray(oncallShifts.state, ['PLANNED', 'CONFIRMED']),
              gte(oncallShifts.startsAt, from),
              lt(oncallShifts.startsAt, to),
            ),
          )
          .orderBy(oncallShifts.startsAt)

        return reply
          .header('content-type', 'text/calendar; charset=utf-8')
          .send(serializeIcal(rows, user.locale))
      },
    )

    app.get<{ Querystring: { from?: string; to?: string; poolId?: string } }>(
      '/api/v1/oncall/shifts',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.read) },
      async (request, reply) => {
        const parsed = z
          .object({
            from: z.string().datetime(),
            to: z.string().datetime(),
            poolId: z.string().uuid().optional(),
          })
          .safeParse(request.query)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const { from, to, poolId } = parsed.data

        const fromDate = new Date(from)
        const toDate = new Date(to)

        if (
          fromDate.getTime() >= toDate.getTime() ||
          toDate.getTime() - fromDate.getTime() >= MAX_RANGE_MS
        ) {
          return reply.code(422).send({
            code: 'oncall_range_too_large',
            params: { fields: ['from', 'to'], maxDays: MAX_RANGE_DAYS },
          })
        }

        const rows = await database
          .select({
            id: oncallShifts.id,
            poolId: oncallShifts.poolId,
            userId: oncallShifts.userId,
            state: oncallShifts.state,
            startsAt: oncallShifts.startsAt,
            endsAt: oncallShifts.endsAt,
            createdAt: oncallShifts.createdAt,
            updatedAt: oncallShifts.updatedAt,
          })
          .from(oncallShifts)
          .where(
            poolId === undefined
              ? and(gte(oncallShifts.startsAt, fromDate), lt(oncallShifts.startsAt, toDate))
              : and(
                  eq(oncallShifts.poolId, poolId),
                  gte(oncallShifts.startsAt, fromDate),
                  lt(oncallShifts.startsAt, toDate),
                ),
          )
          .orderBy(oncallShifts.startsAt)

        return reply.send(
          shiftListResponseSchema.parse({
            shifts: rows.map(shiftRow),
          }),
        )
      },
    )

    app.post(
      '/api/v1/oncall/shifts',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.plan) },
      async (request, reply) => {
        const parsed = createShiftRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const { poolId, userId, publish, startsAt, endsAt, createdByUserId } = parsed.data

        const created = await createShift(database, {
          poolId,
          userId: userId ?? null,
          publish,
          startsAt: startsAt === undefined ? undefined : new Date(startsAt),
          endsAt: endsAt === undefined ? undefined : new Date(endsAt),
          createdByUserId: createdByUserId ?? null,
        })

        const full = await requireShift(database, created.id)

        return reply.code(201).send(oncallShiftSchema.parse(full))
      },
    )

    app.post(
      '/api/v1/oncall/shifts/generate',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.plan) },
      async (request, reply) => {
        const parsed = generateShiftsRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const { poolId, from, to, createdByUserId } = parsed.data

        const result = await generateShifts(database, {
          poolId,
          from: new Date(from),
          to: new Date(to),
          createdByUserId: createdByUserId ?? null,
        })

        return reply.send(generateShiftsResponseSchema.parse(result))
      },
    )

    app.patch<{ Params: { id: string } }>(
      '/api/v1/oncall/shifts/:id',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const shiftId = parseUuidParam(request.params.id)

        if (shiftId === null) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = updateShiftRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const updated = await updateShift(database, shiftId, parsed.data, request.user?.id ?? '')

        const full = await requireShift(database, updated.id)

        return reply.send(oncallShiftSchema.parse(full))
      },
    )

    app.delete<{ Params: { id: string } }>(
      '/api/v1/oncall/shifts/:id',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.admin) },
      async (request, reply) => {
        const shiftId = parseUuidParam(request.params.id)

        if (shiftId === null) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        await deleteShift(database, shiftId, request.user?.id ?? '')

        return reply.code(204).send()
      },
    )

    // Unstaffed slots inside `unfilled_warning_days` and `PLANNED` slots that
    // start within `reminder_unconfirmed_h` (`specs/04-oncall.md` §4a.6).
    app.get(
      '/api/v1/oncall/warnings',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.read) },
      async () => {
        const now = new Date()
        const settingsResolved = await readOncallSettings(database)
        const defaultPoolId = await resolveDefaultPool(database)

        const unstaffedUntil = new Date(
          now.getTime() + settingsResolved.unfilledWarningDays * 24 * 60 * 60 * 1000,
        )
        const unconfirmedUntil = new Date(
          now.getTime() + settingsResolved.reminderUnconfirmedH * 60 * 60 * 1000,
        )

        const columns = {
          id: oncallShifts.id,
          poolId: oncallShifts.poolId,
          userId: oncallShifts.userId,
          state: oncallShifts.state,
          startsAt: oncallShifts.startsAt,
          endsAt: oncallShifts.endsAt,
          createdAt: oncallShifts.createdAt,
          updatedAt: oncallShifts.updatedAt,
        }

        const [unstaffedRows, unconfirmedRows] = await Promise.all([
          database
            .select(columns)
            .from(oncallShifts)
            .where(
              and(
                inArray(oncallShifts.state, ['UNFILLED', 'DECLINED']),
                lte(oncallShifts.startsAt, unstaffedUntil),
                gt(oncallShifts.endsAt, now),
              ),
            )
            .orderBy(oncallShifts.startsAt),
          database
            .select(columns)
            .from(oncallShifts)
            .where(
              and(
                eq(oncallShifts.state, 'PLANNED'),
                lte(oncallShifts.startsAt, unconfirmedUntil),
                gt(oncallShifts.endsAt, now),
              ),
            )
            .orderBy(oncallShifts.startsAt),
        ])

        return {
          defaultPoolId,
          unstaffed: unstaffedRows.map(shiftRow),
          unconfirmed: unconfirmedRows.map(shiftRow),
        }
      },
    )

    app.get(
      '/api/v1/settings/oncall',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        const settingsResolved = await readOncallSettings(database)

        return oncallSettingsResponseSchema.parse({
          weekStartWeekday: settingsResolved.weekStartWeekday,
          startTime: settingsResolved.startTime,
          durationDays: settingsResolved.durationDays,
          swapRequiresAdminApproval: settingsResolved.swapRequiresAdminApproval,
          escalateToGroupAfterMin: settingsResolved.escalateToGroupAfterMin,
          reminderUnconfirmedH: settingsResolved.reminderUnconfirmedH,
          unfilledWarningDays: settingsResolved.unfilledWarningDays,
          defaultPoolId: settingsResolved.defaultPoolId ?? null,
        })
      },
    )

    app.put(
      '/api/v1/settings/oncall',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = updateOncallSettingsRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        const written = await writeOncallSettings(database, parsed.data)

        return oncallSettingsResponseSchema.parse({
          weekStartWeekday: written.weekStartWeekday,
          startTime: written.startTime,
          durationDays: written.durationDays,
          swapRequiresAdminApproval: written.swapRequiresAdminApproval,
          escalateToGroupAfterMin: written.escalateToGroupAfterMin,
          reminderUnconfirmedH: written.reminderUnconfirmedH,
          unfilledWarningDays: written.unfilledWarningDays,
          defaultPoolId: written.defaultPoolId ?? null,
        })
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/shifts/:id/confirm',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.confirm) },
      async (request, reply) => {
        const shiftId = parseUuidParam(request.params.id)

        if (shiftId === null) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = confirmShiftRequestSchema.safeParse(request.body ?? {})

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        try {
          const result = await confirmShift(database, {
            shiftId,
            actorUserId: request.user?.id ?? '',
            clientUuid: parsed.data.clientUuid ?? null,
          })

          const full = await requireShift(database, result.shift.id)

          return reply.send(oncallShiftSchema.parse(full))
        } catch (error) {
          const err = error as {
            statusCode?: number
            code?: string
            params?: Record<string, unknown>
          }

          if (err.statusCode !== undefined) {
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }

          throw error
        }
      },
    )

    app.post<{ Params: { id: string } }>(
      '/api/v1/oncall/shifts/:id/decline',
      { preHandler: requirePermission(database, PERMISSIONS.oncall.confirm) },
      async (request, reply) => {
        const shiftId = parseUuidParam(request.params.id)

        if (shiftId === null) {
          return reply.code(400).send(invalidRequest(['id']))
        }

        const parsed = declineBodySchema.safeParse(request.body ?? {})

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              invalidRequest([
                ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
              ]),
            )
        }

        try {
          const result = await declineShift(database, {
            shiftId,
            actorUserId: request.user?.id ?? '',
            reason: parsed.data.reason ?? '',
            clientUuid: parsed.data.clientUuid ?? null,
          })

          const full = await requireShift(database, result.shift.id)

          return reply.send(oncallShiftSchema.parse(full))
        } catch (error) {
          const err = error as {
            statusCode?: number
            code?: string
            params?: Record<string, unknown>
          }

          if (err.statusCode !== undefined) {
            return reply.code(err.statusCode).send({ code: err.code, params: err.params })
          }

          throw error
        }
      },
    )

    await app.register(swapRoutes, { database })
  },
  { name: 'stoerdesk-oncall-routes' },
)
