import { sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createObjectRequestSchema,
  objectBulkResponseSchema,
  objectNoSchema,
  objectSummarySchema,
  objectUpsertRequestSchema,
  PERMISSIONS,
  type ObjectBulkResult,
  type ObjectSummary,
  type ObjectUpsertRequest,
} from '@stoerdesk/shared'

import { requireScopeOrPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects } from '../db/schema'
import { generateQrToken } from './qr'

/**
 * External object API (`specs/08-objects-api.md` §9.5, ADR-0013, WP-M10-07):
 * `PUT` upsert by object number and the bulk upsert. The list, read and soft
 * delete live in `service.ts` and accept the bearer key through the dual guard.
 */

type Db = Database['database']

class ExternalObjectError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ExternalObjectError'
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

const bulkEnvelopeSchema = z.object({
  items: z.array(z.unknown()).min(1).max(500),
})

export type ObjectUpsertResult = { object: ObjectSummary; created: boolean }

/** Replace or create one object by its external object number. */
export async function upsertObject(
  database: Db,
  objectNo: string,
  input: ObjectUpsertRequest,
): Promise<ObjectUpsertResult> {
  try {
    return await database.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(objects)
        .where(sql`lower(${objects.objectNo}) = lower(${objectNo})`)
        .limit(1)

      const fields = {
        name: input.name,
        street: input.street ?? null,
        houseNumber: input.houseNumber ?? null,
        postalCode: input.postalCode ?? null,
        city: input.city ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        externalId: input.externalId ?? null,
        notes: input.notes ?? null,
      }

      if (existing === undefined) {
        const [row] = await tx
          .insert(objects)
          .values({ objectNo, ...fields, qrToken: generateQrToken() })
          .returning()

        if (row === undefined) {
          throw new ExternalObjectError(500, 'object_create_failed')
        }

        return { object: objectSummarySchema.parse(row), created: true }
      }

      const [row] = await tx
        .update(objects)
        .set({ ...fields, updatedAt: new Date() })
        .where(sql`${objects.id} = ${existing.id}`)
        .returning()

      if (row === undefined) {
        throw new ExternalObjectError(500, 'object_update_failed')
      }

      return { object: objectSummarySchema.parse(row), created: false }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ExternalObjectError(422, 'object_no_taken', { fields: ['objectNo'] })
    }

    throw error
  }
}

function resultError(error: unknown) {
  if (error instanceof ExternalObjectError) {
    return { code: error.code, params: error.params }
  }

  return { code: 'internal_error', params: {} }
}

export type ExternalObjectRouteOptions = {
  database: Db
}

export const externalObjectRoutes = fp<ExternalObjectRouteOptions>(
  async (app, { database }) => {
    app.put<{ Params: { objectNo: string } }>(
      '/api/v1/objects/:objectNo',
      { preHandler: requireScopeOrPermission(database, 'objects:write', PERMISSIONS.object.write) },
      async (request, reply) => {
        const objectNo = objectNoSchema.safeParse(request.params.objectNo)

        if (!objectNo.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['objectNo'] } })
        }

        const parsed = objectUpsertRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        try {
          const result = await upsertObject(database, objectNo.data, parsed.data)

          return reply.code(result.created ? 201 : 200).send(result.object)
        } catch (error) {
          if (error instanceof ExternalObjectError) {
            return reply.code(error.statusCode).send({ code: error.code, params: error.params })
          }

          throw error
        }
      },
    )

    app.post(
      '/api/v1/objects/bulk',
      { preHandler: requireScopeOrPermission(database, 'objects:write', PERMISSIONS.object.write) },
      async (request, reply) => {
        const envelope = bulkEnvelopeSchema.safeParse(request.body)

        if (!envelope.success) {
          return reply
            .code(422)
            .send({ code: 'invalid_request', params: { fields: fieldPaths(envelope.error) } })
        }

        const results: ObjectBulkResult[] = []

        for (const [index, raw] of envelope.data.items.entries()) {
          const parsed = createObjectRequestSchema.safeParse(raw)

          if (!parsed.success) {
            results.push({
              objectNo:
                typeof raw === 'object' && raw !== null && typeof (raw as { objectNo?: unknown }).objectNo === 'string'
                  ? (raw as { objectNo: string }).objectNo
                  : '',
              action: 'error',
              error: { code: 'invalid_request', params: { fields: fieldPaths(parsed.error), index } },
            })
            continue
          }

          try {
            const { objectNo, ...input } = parsed.data
            const result = await upsertObject(database, objectNo, input)

            results.push({
              objectNo: result.object.objectNo,
              action: result.created ? 'created' : 'updated',
              error: null,
            })
          } catch (error) {
            results.push({
              objectNo: parsed.data.objectNo,
              action: 'error',
              error: resultError(error),
            })
          }
        }

        return objectBulkResponseSchema.parse({ results })
      },
    )
  },
  { name: 'stoerdesk-external-objects' },
)
