import { eq, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  detectedErrorCreateRequestSchema,
  detectedErrorInUseCode,
  detectedErrorKeyTakenCode,
  detectedErrorListResponseSchema,
  detectedErrorNotFoundCode,
  detectedErrorResponseSchema,
  detectedErrorUpdateRequestSchema,
  PERMISSIONS,
  type DetectedErrorCreateRequest,
  type DetectedErrorUpdateRequest,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { detectedErrors, tickets } from '../db/schema'

/**
 * Detected-error catalog administration (`specs/13-detected-errors.md` §13.3,
 * WP-M11-03).
 *
 * `GET /api/v1/detected-errors` — `settings.read`, lists all keys with labels
 * and archive status.
 * `POST /api/v1/detected-errors` — `settings.write`, creates a key.
 * `PATCH /api/v1/detected-errors/:key` — `settings.write`, edits labels or
 * sets/clears `archived_at`.
 * `DELETE /api/v1/detected-errors/:key` — `settings.write`, deletes only if
   no ticket carries the key, otherwise `409 detected_error_in_use`.
 */

type Db = Database['database']

class DetectedErrorRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'DetectedErrorRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  if ((error as { code?: string }).code === '23505') {
    return true
  }

  return isUniqueViolation((error as { cause?: unknown }).cause)
}

async function usageCount(database: Db, key: string): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)` })
    .from(tickets)
    .where(sql`${tickets.detectedErrorKeys} @> ARRAY[${key}]::text[]`)

  return Number(row?.total ?? 0)
}

export const detectedErrorsRoutes = fp<{ database: Db }>(
  async (app, { database }) => {
    app.get(
      '/api/v1/detected-errors',
      { preHandler: requirePermission(database, PERMISSIONS.settings.read) },
      async () => {
        const rows = await database
          .select()
          .from(detectedErrors)
          .orderBy(detectedErrors.key)

        return detectedErrorListResponseSchema.parse({
          detectedErrors: rows.map((row) => detectedErrorResponseSchema.parse({
            key: row.key,
            labelDe: row.labelDe,
            labelEn: row.labelEn,
            archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
        })
      },
    )

    app.post(
      '/api/v1/detected-errors',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = detectedErrorCreateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new DetectedErrorRouteError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
        }

        const body = parsed.data as DetectedErrorCreateRequest

        try {
          const [row] = await database
            .insert(detectedErrors)
            .values({
              key: body.key,
              labelDe: body.labelDe,
              labelEn: body.labelEn,
            })
            .returning()

          if (row === undefined) {
            throw new DetectedErrorRouteError(500, 'detected_error_create_failed')
          }

          return reply.code(201).send(detectedErrorResponseSchema.parse({
            key: row.key,
            labelDe: row.labelDe,
            labelEn: row.labelEn,
            archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }))
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new DetectedErrorRouteError(409, detectedErrorKeyTakenCode, { fields: ['key'] })
          }
          throw error
        }
      },
    )

    app.patch<{ Params: { key: string } }>(
      '/api/v1/detected-errors/:key',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const parsed = detectedErrorUpdateRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          throw new DetectedErrorRouteError(400, 'invalid_request', { fields: fieldPaths(parsed.error) })
        }

        const [current] = await database
          .select()
          .from(detectedErrors)
          .where(eq(detectedErrors.key, request.params.key))
          .limit(1)

        if (current === undefined) {
          throw new DetectedErrorRouteError(404, detectedErrorNotFoundCode, { fields: ['key'] })
        }

        const body = parsed.data as DetectedErrorUpdateRequest
        const set: Record<string, unknown> = { updatedAt: new Date() }

        if (body.key !== undefined && body.key !== current.key) {
          set.key = body.key
        }
        if (body.labelDe !== undefined) {
          set.labelDe = body.labelDe
        }
        if (body.labelEn !== undefined) {
          set.labelEn = body.labelEn
        }
        if (body.archivedAt !== undefined) {
          set.archivedAt = body.archivedAt === null ? null : new Date(body.archivedAt)
        }

        const [updated] = await database
          .update(detectedErrors)
          .set(set)
          .where(eq(detectedErrors.key, current.key))
          .returning()

        if (updated === undefined) {
          throw new DetectedErrorRouteError(404, detectedErrorNotFoundCode, { fields: ['key'] })
        }

        return reply.code(200).send(detectedErrorResponseSchema.parse({
          key: updated.key,
          labelDe: updated.labelDe,
          labelEn: updated.labelEn,
          archivedAt: updated.archivedAt === null ? null : updated.archivedAt.toISOString(),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        }))
      },
    )

    app.delete<{ Params: { key: string } }>(
      '/api/v1/detected-errors/:key',
      { preHandler: requirePermission(database, PERMISSIONS.settings.write) },
      async (request, reply) => {
        const [current] = await database
          .select()
          .from(detectedErrors)
          .where(eq(detectedErrors.key, request.params.key))
          .limit(1)

        if (current === undefined) {
          throw new DetectedErrorRouteError(404, detectedErrorNotFoundCode, { fields: ['key'] })
        }

        const used = await usageCount(database, current.key)

        if (used > 0) {
          throw new DetectedErrorRouteError(409, detectedErrorInUseCode, {
            fields: ['key'],
            key: current.key,
            usageCount: used,
          })
        }

        await database.delete(detectedErrors).where(eq(detectedErrors.key, current.key))

        return reply.code(204).send()
      },
    )
  },
  { name: 'stoerdesk-settings-detected-errors' },
)
