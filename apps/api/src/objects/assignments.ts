import { and, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  objectAssignmentRequestSchema,
  objectAssignmentSchema,
  objectNoSchema,
  PERMISSIONS,
  type ObjectAssignment,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objectAssignments, objects, roles, userRoles, users } from '../db/schema'

/**
 * The trained people of an object (`specs/19-customer-portal.md` §19.2,
 * ADR-0053): the customers the operator has instructed for this object.
 *
 * The list is read by the administration in the edit page of the object and by
 * the internal creation of a ticket; the write belongs to the administration
 * alone (`object.assign`).
 */

type Db = Database['database']

class AssignmentRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'AssignmentRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

async function objectIdOf(database: Db, objectNo: string): Promise<string> {
  const rows = await database
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.objectNo, objectNo))
    .limit(1)

  const [row] = rows

  if (row === undefined) {
    throw new AssignmentRouteError(404, 'object_not_found', { objectNo })
  }

  return row.id
}

/** The trained people of an object — the name of the customer, never his address. */
export async function listAssignments(database: Db, objectNo: string): Promise<ObjectAssignment[]> {
  const objectId = await objectIdOf(database, objectNo)

  const rows = await database
    .select({
      userId: users.id,
      givenName: users.givenName,
      familyName: users.familyName,
      createdAt: objectAssignments.createdAt,
    })
    .from(objectAssignments)
    .innerJoin(users, eq(users.id, objectAssignments.userId))
    .where(eq(objectAssignments.objectId, objectId))
    .orderBy(users.familyName, users.givenName)

  return rows.map((row) =>
    objectAssignmentSchema.parse({ ...row, createdAt: row.createdAt.toISOString() }),
  )
}

/**
 * Adds a customer to the trained people of an object. The customer has to be a
 * user with the role `customer` — the office does not instruct a colleague of
 * the office by mistake.
 */
export async function addAssignment(
  database: Db,
  objectNo: string,
  userId: string,
  createdByUserId: string,
): Promise<ObjectAssignment> {
  const objectId = await objectIdOf(database, objectNo)

  const customerRows = await database
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, userId), eq(roles.key, 'customer')))
    .limit(1)

  if (customerRows.length === 0) {
    throw new AssignmentRouteError(404, 'customer_not_found', { userId })
  }

  const existing = await database
    .select({ id: objectAssignments.id })
    .from(objectAssignments)
    .where(and(eq(objectAssignments.objectId, objectId), eq(objectAssignments.userId, userId)))
    .limit(1)

  if (existing.length > 0) {
    throw new AssignmentRouteError(409, 'object_assignee_exists', { userId })
  }

  const [row] = await database
    .insert(objectAssignments)
    .values({ objectId, userId, createdByUserId })
    .returning({
      userId: objectAssignments.userId,
      createdAt: objectAssignments.createdAt,
    })

  if (row === undefined) {
    throw new AssignmentRouteError(500, 'internal_error')
  }

  const [customer] = await database
    .select({ givenName: users.givenName, familyName: users.familyName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return objectAssignmentSchema.parse({
    userId: row.userId,
    givenName: customer?.givenName ?? '',
    familyName: customer?.familyName ?? '',
    createdAt: row.createdAt.toISOString(),
  })
}

/** Removes a customer from the trained people of an object. */
export async function removeAssignment(
  database: Db,
  objectNo: string,
  userId: string,
): Promise<void> {
  const objectId = await objectIdOf(database, objectNo)

  const deleted = await database
    .delete(objectAssignments)
    .where(and(eq(objectAssignments.objectId, objectId), eq(objectAssignments.userId, userId)))
    .returning({ id: objectAssignments.id })

  if (deleted.length === 0) {
    throw new AssignmentRouteError(404, 'object_assignment_not_found', { userId })
  }
}

export type AssignmentRouteOptions = {
  database: Db
}

export const objectAssignmentRoutes = fp<AssignmentRouteOptions>(async (app, { database }) => {
  app.get<{ Params: { objectNo: string } }>(
    '/api/v1/objects/:objectNo/assignments',
    { preHandler: requirePermission(database, PERMISSIONS.object.read) },
    async (request, reply) => {
      const parsed = objectNoSchema.safeParse(request.params.objectNo)

      if (!parsed.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['objectNo'] } })
      }

      return { assignments: await listAssignments(database, parsed.data) }
    },
  )

  app.post<{ Params: { objectNo: string } }>(
    '/api/v1/objects/:objectNo/assignments',
    { preHandler: requirePermission(database, PERMISSIONS.object.assign) },
    async (request, reply) => {
      const parsedObjectNo = objectNoSchema.safeParse(request.params.objectNo)

      if (!parsedObjectNo.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['objectNo'] } })
      }

      const parsed = objectAssignmentRequestSchema.safeParse(request.body)

      if (!parsed.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['userId'] } })
      }

      const assignment = await addAssignment(
        database,
        parsedObjectNo.data,
        parsed.data.userId,
        request.user?.id ?? '',
      )

      return reply.code(201).send({ assignment })
    },
  )

  app.delete<{ Params: { objectNo: string; userId: string } }>(
    '/api/v1/objects/:objectNo/assignments/:userId',
    { preHandler: requirePermission(database, PERMISSIONS.object.assign) },
    async (request, reply) => {
      const parsedObjectNo = objectNoSchema.safeParse(request.params.objectNo)

      if (!parsedObjectNo.success) {
        return reply.code(400).send({ code: 'invalid_request', params: { fields: ['objectNo'] } })
      }

      await removeAssignment(database, parsedObjectNo.data, request.params.userId)

      return reply.code(204).send()
    },
  )
})
