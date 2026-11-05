import { and, eq, ilike, or, sql } from 'drizzle-orm'
import fp from 'fastify-plugin'
import { z } from 'zod'
import {
  createObjectRequestSchema,
  objectListQuerySchema,
  objectListResponseSchema,
  objectNoSchema,
  objectSummarySchema,
  PERMISSIONS,
  updateObjectRequestSchema,
  type CreateObjectRequest,
  type ObjectListQuery,
  type ObjectSummary,
  type UpdateObjectRequest,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects } from '../db/schema'
import { generateQrToken, qrRoutes } from './qr'

/**
 * Object list API (`specs/08-objects-api.md` §9.1).
 *
 * The routes and their service functions share this module, so the slice stays
 * inside the source-file budget of `PLAN.md` §17. The object number is the
 * external key; internal links keep using the UUID.
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

function summarize(row: ObjectRow): ObjectSummary {
  return objectSummarySchema.parse(row)
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

  if (query.search !== undefined) {
    const pattern = `%${query.search}%`
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

export async function listObjects(database: Db, query: ObjectListQuery): Promise<ObjectSummary[]> {
  const rows = await database
    .select()
    .from(objects)
    .where(whereFromQuery(query))
    .orderBy(objects.objectNo)

  return rows.map((row) => summarize(row))
}

export async function getObject(database: Db, objectNo: string): Promise<ObjectSummary> {
  const row = await findByObjectNo(database, objectNo)

  return summarize(row)
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

      return summarize(row)
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

      return summarize(row)
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
      { preHandler: requirePermission(database, PERMISSIONS.object.read) },
      async (request, reply) => {
        const parsed = objectListQuerySchema.safeParse(request.query)

        if (!parsed.success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: fieldPaths(parsed.error) } })
        }

        return objectListResponseSchema.parse({ objects: await listObjects(database, parsed.data) })
      },
    )

    app.get<{ Params: { objectNo: string } }>(
      '/api/v1/objects/:objectNo',
      { preHandler: requirePermission(database, PERMISSIONS.object.read) },
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
      { preHandler: requirePermission(database, PERMISSIONS.object.delete) },
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
