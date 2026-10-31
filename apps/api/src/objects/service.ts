import { and, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm'
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
  type ObjectSystemInput,
  type ObjectSummary,
  type UpdateObjectRequest,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, systems } from '../db/schema'

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
type SystemRow = typeof systems.$inferSelect

function summarize(row: ObjectRow, rows: SystemRow[]): ObjectSummary {
  return objectSummarySchema.parse({
    ...row,
    systems: rows.map(({ id, type, label }) => ({ id, type, label })),
  })
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

async function loadSystems(database: Executor, objectIds: string[]): Promise<Map<string, SystemRow[]>> {
  const byObject = new Map<string, SystemRow[]>()

  if (objectIds.length === 0) {
    return byObject
  }

  const rows = await database
    .select()
    .from(systems)
    .where(inArray(systems.objectId, objectIds))
    .orderBy(systems.type, systems.label)

  for (const row of rows) {
    const existing = byObject.get(row.objectId) ?? []
    existing.push(row)
    byObject.set(row.objectId, existing)
  }

  return byObject
}

function whereFromQuery(database: Executor, query: ObjectListQuery) {
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

  if (query.systemType !== undefined) {
    const systemType = query.systemType
    conditions.push(
      exists(
        database
          .select({ one: sql`1` })
          .from(systems)
          .where(and(eq(systems.objectId, objects.id), eq(systems.type, systemType))),
      ),
    )
  }

  return conditions.length === 0 ? undefined : and(...conditions)
}

export async function listObjects(database: Db, query: ObjectListQuery): Promise<ObjectSummary[]> {
  const rows = await database
    .select()
    .from(objects)
    .where(whereFromQuery(database, query))
    .orderBy(objects.objectNo)

  const systemsByObject = await loadSystems(
    database,
    rows.map((row) => row.id),
  )

  return rows.map((row) => summarize(row, systemsByObject.get(row.id) ?? []))
}

export async function getObject(database: Db, objectNo: string): Promise<ObjectSummary> {
  const row = await findByObjectNo(database, objectNo)
  const systemsByObject = await loadSystems(database, [row.id])

  return summarize(row, systemsByObject.get(row.id) ?? [])
}

function systemValues(objectId: string, entries: ObjectSystemInput[]) {
  return entries.map((entry) => ({ objectId, type: entry.type, label: entry.label }))
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
        })
        .returning()

      const [row] = inserted

      if (row === undefined) {
        throw new ObjectRouteError(500, 'object_create_failed', {})
      }

      if (input.systems.length > 0) {
        await tx.insert(systems).values(systemValues(row.id, input.systems))
      }

      const systemsByObject = await loadSystems(tx, [row.id])

      return summarize(row, systemsByObject.get(row.id) ?? [])
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ObjectRouteError(422, 'object_no_taken', { fields: ['objectNo'] })
    }

    throw error
  }
}

async function syncSystems(
  database: Executor,
  objectId: string,
  entries: ObjectSystemInput[],
): Promise<void> {
  const existing = await database
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.objectId, objectId))
  const existingIds = new Set(existing.map((row) => row.id))
  const keptIds: string[] = []

  for (const [index, entry] of entries.entries()) {
    if (entry.id === undefined) {
      const inserted = await database
        .insert(systems)
        .values({ objectId, type: entry.type, label: entry.label })
        .returning({ id: systems.id })

      const [row] = inserted

      if (row !== undefined) {
        keptIds.push(row.id)
      }

      continue
    }

    if (!existingIds.has(entry.id)) {
      throw invalidRequest([`systems.${index}.id`])
    }

    await database
      .update(systems)
      .set({ type: entry.type, label: entry.label, updatedAt: new Date() })
      .where(eq(systems.id, entry.id))
    keptIds.push(entry.id)
  }

  const removedIds = existing
    .map((row) => row.id)
    .filter((id) => keptIds.includes(id) === false)

  if (removedIds.length > 0) {
    await database.delete(systems).where(inArray(systems.id, removedIds))
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

      if (input.systems !== undefined) {
        await syncSystems(tx, existing.id, input.systems)
      }

      const systemsByObject = await loadSystems(tx, [row.id])

      return summarize(row, systemsByObject.get(row.id) ?? [])
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
  },
  { name: 'stoerdesk-objects' },
)
