import { and, eq, gt, ilike, or, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  escapeLikePattern,
  createObjectRequestSchema,
  objectCityListResponseSchema,
  objectListQuerySchema,
  objectListResponseSchema,
  objectNoSchema,
  objectSummarySchema,
  PERMISSIONS,
  updateObjectRequestSchema,
  type CreateObjectRequest,
  type ObjectListQuery,
  type ObjectSummary,
  type TicketPriority,
  type UpdateObjectRequest,
} from '@stoerdesk/shared'

import { requirePermission, requireScopeOrPermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects } from '../db/schema'
import {
  readPriorityOverrides,
  readStandardPriority,
  writeObjectPriority,
} from './priority'
import { generateQrToken, qrRoutes } from './qr'
import { WITHOUT_OBJECT_OBJECT_NO } from '../db/schema'

/**
 * Object list API (`specs/08-objects-api.md` §9.1).
 *
 * The routes and their service functions share this module, so the slice stays
 * inside the source-file budget of `PLAN.md` §17. The object number is the
 * external key; internal links keep using the UUID.
 *
 * The priority of an object is the deviation from the standard
 * (`specs/02-data-model.md` §4.3.2, ADR-0029): the standard is the setting
 * `ticket.default_priority`, the deviations live in the table
 * `object_priority_overrides`.
 */

type Db = Database['database']
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

class ObjectRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ObjectRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new ObjectRouteError(400, 'invalid_request', { fields })
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

type ObjectRow = typeof objects.$inferSelect

/**
 * The summary of an object: the row of the table and the two fields of the
 * priority — the effective priority and the stored deviation.
 */
export function summarizeObject(
  row: ObjectRow & { pinned?: boolean },
  priority: TicketPriority,
  priorityOverride: TicketPriority | null,
): ObjectSummary {
  return objectSummarySchema.parse({ ...row, pinned: row.pinned === true, priority, priorityOverride })
}

async function findByObjectNo(database: Executor, objectNo: string): Promise<ObjectRow> {
  const [row] = await database
    .select()
    .from(objects)
    .where(sql`lower(${objects.objectNo}) = lower(${objectNo})`)
    .limit(1)

  if (row === undefined) {
    throw new ObjectRouteError(404, 'object_not_found', { fields: ['objectNo'] })
  }

  return row
}

function whereFromQuery(query: ObjectListQuery) {
  const conditions = []

  if (query.active !== 'all') {
    conditions.push(eq(objects.active, query.active === 'true'))
  }

  if (query.city !== undefined) {
    conditions.push(sql`lower(${objects.city}) = lower(${query.city})`)
  }

  if (query.updated_since !== undefined) {
    conditions.push(gt(objects.updatedAt, new Date(query.updated_since)))
  }

  if (query.search !== undefined) {
    const pattern = `%${escapeLikePattern(query.search)}%`
    conditions.push(
      or(
        ilike(objects.objectNo, pattern),
        ilike(objects.name, pattern),
        ilike(objects.street, pattern),
        ilike(objects.city, pattern),
        ilike(objects.externalId, pattern),
      ),
    )
  }

  return conditions.length === 0 ? undefined : and(...conditions)
}

/**
 * The summary of the rows of the object list: the standard and the deviations
 * are read once, every row takes its own deviation.
 */
async function summarizeRows(
  database: Executor,
  rows: ObjectRow[],
): Promise<ObjectSummary[]> {
  const standard = await readStandardPriority(database)
  const overrides = await readPriorityOverrides(database)

  return rows.map((row) => {
    const override = overrides.get(row.id) ?? null

    return summarizeObject(row, override ?? standard, override)
  })
}

export async function listObjects(database: Db, query: ObjectListQuery): Promise<ObjectSummary[]> {
  const ordered = database
    .select()
    .from(objects)
    .where(whereFromQuery(query))
    .orderBy(query.updated_since === undefined ? objects.objectNo : objects.updatedAt)

  const rows = query.limit === undefined ? await ordered : await ordered.limit(query.limit)

  // The reserved object „Ohne Objekt" (OHNE-OBJEKT) stands in for customers
  // without a contract: it is pinned to the end of every list (ADR-0042).
  const marked = rows.map((row) => ({
    ...row,
    pinned: row.objectNo === WITHOUT_OBJECT_OBJECT_NO,
  }))
  marked.sort((a, b) => {
    if (a.pinned === b.pinned) {
      return a.objectNo.localeCompare(b.objectNo)
    }
    return a.pinned ? 1 : -1
  })

  return summarizeRows(database, marked)
}

export async function getObject(database: Db, objectNo: string): Promise<ObjectSummary> {
  const row = await findByObjectNo(database, objectNo)
  const [summary] = await summarizeRows(database, [row])

  if (summary === undefined) {
    throw new ObjectRouteError(404, 'object_not_found', { fields: ['objectNo'] })
  }

  return summary
}

export async function createObject(
  database: Db,
  input: CreateObjectRequest,
): Promise<ObjectSummary> {
  try {
    return await database.transaction(async (tx) => {
      const inserted = await tx
        .insert(objects)
        .values({
          objectNo: input.objectNo,
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
          qrToken: generateQrToken(),
        })
        .returning()

      const [row] = inserted

      if (row === undefined) {
        throw new ObjectRouteError(500, 'object_create_failed', {})
      }

      if (input.priority !== undefined) {
        await writeObjectPriority(tx, row.id, input.priority)
      }

      const [summary] = await summarizeRows(tx, [row])

      if (summary === undefined) {
        throw new ObjectRouteError(500, 'object_create_failed', {})
      }

      return summary
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ObjectRouteError(422, 'object_no_taken', { fields: ['objectNo'] })
    }

    throw error
  }
}

export async function updateObject(
  database: Db,
  objectNo: string,
  input: UpdateObjectRequest,
): Promise<ObjectSummary> {
  try {
    return await database.transaction(async (tx) => {
      const existing = await findByObjectNo(tx, objectNo)
      const patch: Partial<typeof objects.$inferInsert> = { updatedAt: new Date() }

      if (input.objectNo !== undefined) patch.objectNo = input.objectNo
      if (input.name !== undefined) patch.name = input.name
      if (input.street !== undefined) patch.street = input.street
      if (input.houseNumber !== undefined) patch.houseNumber = input.houseNumber
      if (input.postalCode !== undefined) patch.postalCode = input.postalCode
      if (input.city !== undefined) patch.city = input.city
      if (input.contactName !== undefined) patch.contactName = input.contactName
      if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone
      if (input.contactEmail !== undefined) patch.contactEmail = input.contactEmail
      if (input.externalId !== undefined) patch.externalId = input.externalId
      if (input.notes !== undefined) patch.notes = input.notes

      const updated = await tx
        .update(objects)
        .set(patch)
        .where(eq(objects.id, existing.id))
        .returning()

      const [row] = updated

      if (row === undefined) {
        throw new ObjectRouteError(500, 'object_update_failed', {})
      }

      if (input.priority !== undefined) {
        await writeObjectPriority(tx, existing.id, input.priority)
      }

      const [summary] = await summarizeRows(tx, [row])

      if (summary === undefined) {
        throw new ObjectRouteError(500, 'object_update_failed', {})
      }

      return summary
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ObjectRouteError(422, 'object_no_taken', { fields: ['objectNo'] })
    }

    throw error
  }
}

export async function softDeleteObject(database: Db, objectNo: string): Promise<void> {
  const row = await findByObjectNo(database, objectNo)

  if (row.objectNo === WITHOUT_OBJECT_OBJECT_NO) {
    throw new ObjectRouteError(422, 'object_reserved', { fields: ['objectNo'] })
  }

  await database
    .update(objects)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(objects.id, row.id))
}

export type ObjectRouteOptions = {
  database: Db
}

export const objectRoutes = fp<ObjectRouteOptions>(
  async (app, { database }) => {
    app.get(
      '/api/v1/objects',
      { preHandler: requireScopeOrPermission(database, 'objects:read', PERMISSIONS.object.read) },
      async (request, reply) => {
        const parsed = objectListQuerySchema.safeParse(request.query)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        const query =
          parsed.data.limit === undefined && request.apiKey !== undefined
            ? { ...parsed.data, limit: 500 }
            : parsed.data

        return objectListResponseSchema.parse({ objects: await listObjects(database, query) })
      },
    )

    app.get(
      '/api/v1/objects/cities',
      { preHandler: requireScopeOrPermission(database, 'objects:read', PERMISSIONS.object.read) },
      async () => {
        const rows = await database
          .selectDistinct({ city: objects.city })
          .from(objects)
          .where(eq(objects.active, true))
          .orderBy(objects.city)

        const cities = rows
          .map((row) => row.city)
          .filter((city): city is string => city !== null)
          .sort((left, right) => left.localeCompare(right, 'de'))

        return objectCityListResponseSchema.parse({ cities })
      },
    )

    app.get<{ Params: { objectNo: string } }>(
      '/api/v1/objects/:objectNo',
      { preHandler: requireScopeOrPermission(database, 'objects:read', PERMISSIONS.object.read) },
      async (request, reply) => {
        const parsed = objectNoSchema.safeParse(request.params.objectNo)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(['objectNo']))
        }

        return getObject(database, parsed.data)
      },
    )

    app.post(
      '/api/v1/objects',
      { preHandler: requirePermission(database, PERMISSIONS.object.write) },
      async (request, reply) => {
        const parsed = createObjectRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        return reply.code(201).send(await createObject(database, parsed.data))
      },
    )

    app.patch<{ Params: { objectNo: string } }>(
      '/api/v1/objects/:objectNo',
      { preHandler: requirePermission(database, PERMISSIONS.object.write) },
      async (request, reply) => {
        const parsedObjectNo = objectNoSchema.safeParse(request.params.objectNo)

        if (!parsedObjectNo.success) {
          return reply.code(400).send(invalidRequest(['objectNo']))
        }

        const parsed = updateObjectRequestSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
        }

        return updateObject(database, parsedObjectNo.data, parsed.data)
      },
    )

    app.delete<{ Params: { objectNo: string } }>(
      '/api/v1/objects/:objectNo',
      { preHandler: requireScopeOrPermission(database, 'objects:write', PERMISSIONS.object.delete) },
      async (request, reply) => {
        const parsed = objectNoSchema.safeParse(request.params.objectNo)

        if (!parsed.success) {
          return reply.code(400).send(invalidRequest(['objectNo']))
        }

        await softDeleteObject(database, parsed.data)

        return reply.code(204).send()
      },
    )

    await app.register(qrRoutes, { database })
  },
  { name: 'stoerdesk-objects' },
)
