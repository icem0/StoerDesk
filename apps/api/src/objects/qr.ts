import { randomBytes } from 'node:crypto'

import { and, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  objectNoSchema,
  PERMISSIONS,
  publicQrObjectSchema,
  qrResolveResponseSchema,
  qrTokenSchema,
  regenerateQrRequestSchema,
  regenerateQrResponseSchema,
  type PublicQrObject,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { objects, oldQrTokens, systems } from '../db/schema'

/**
 * QR token generation, regeneration and public resolution
 * (`specs/08-objects-api.md` §9.2, WP-M2-02).
 */

type Db = Database['database']
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx
type ObjectRow = typeof objects.$inferSelect

const QR_TOKEN_BYTES = 16
const RETIRED_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

class QrRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'QrRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function invalidRequest(fields: string[]) {
  return new QrRouteError(400, 'invalid_request', { fields })
}

function fieldPaths(error: z.ZodError) {
  return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

/** 128 random bits as 22 URL-safe characters (exactly the spec length). */
export function generateQrToken(): string {
  return randomBytes(QR_TOKEN_BYTES).toString('base64url')
}

async function findByObjectNo(database: Executor, objectNo: string): Promise<ObjectRow> {
  const [row] = await database
    .select()
    .from(objects)
    .where(sql`lower(${objects.objectNo}) = lower(${objectNo})`)
    .limit(1)

  if (row === undefined) {
    throw new QrRouteError(404, 'object_not_found', { fields: ['objectNo'] })
  }

  return row
}

async function rotateQrToken(
  database: Db,
  objectNo: string,
  blockOldToken: boolean,
): Promise<string> {
  return database.transaction(async (tx) => {
    const row = await findByObjectNo(tx, objectNo)
    const nextToken = generateQrToken()

    if (row.qrToken !== null) {
      await tx
        .insert(oldQrTokens)
        .values({
          objectId: row.id,
          token: row.qrToken,
          expiresAt: new Date(blockOldToken ? Date.now() : Date.now() + RETIRED_TOKEN_TTL_MS),
        })
        .onConflictDoNothing()
    }

    await tx
      .update(objects)
      .set({ qrToken: nextToken, updatedAt: new Date() })
      .where(eq(objects.id, row.id))

    return nextToken
  })
}

async function publicObject(database: Executor, row: ObjectRow): Promise<PublicQrObject> {
  const rows = await database
    .select({ id: systems.id, type: systems.type, label: systems.label })
    .from(systems)
    .where(eq(systems.objectId, row.id))
    .orderBy(systems.type, systems.label)

  return publicQrObjectSchema.parse({
    objectNo: row.objectNo,
    name: row.name,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    systems: rows,
  })
}

async function resolveQrToken(database: Db, token: string) {
  const [current] = await database
    .select()
    .from(objects)
    .where(and(eq(objects.qrToken, token), eq(objects.active, true)))
    .limit(1)

  if (current !== undefined) {
    return qrResolveResponseSchema.parse({
      token: current.qrToken,
      redirected: false,
      object: await publicObject(database, current),
    })
  }

  const [retired] = await database
    .select({ object: objects })
    .from(oldQrTokens)
    .innerJoin(objects, eq(oldQrTokens.objectId, objects.id))
    .where(
      and(
        eq(oldQrTokens.token, token),
        gt(oldQrTokens.expiresAt, new Date()),
        eq(objects.active, true),
      ),
    )
    .limit(1)

  if (retired !== undefined && retired.object.qrToken !== null) {
    return qrResolveResponseSchema.parse({
      token: retired.object.qrToken,
      redirected: true,
      object: await publicObject(database, retired.object),
    })
  }

  throw new QrRouteError(404, 'qr_token_not_found', {})
}

export type QrRouteOptions = {
  database: Db
}

export async function qrRoutes(app: import('fastify').FastifyInstance, { database }: QrRouteOptions) {
  app.post<{ Params: { objectNo: string } }>(
    '/api/v1/objects/:objectNo/regenerate-qr',
    { preHandler: requirePermission(database, PERMISSIONS.object.regenerateQr) },
    async (request, reply) => {
      const parsedObjectNo = objectNoSchema.safeParse(request.params.objectNo)

      if (!parsedObjectNo.success) {
        return reply.code(400).send(invalidRequest(['objectNo']))
      }

      const parsed = regenerateQrRequestSchema.safeParse(request.body ?? {})

      if (!parsed.success) {
        return reply.code(400).send(invalidRequest(fieldPaths(parsed.error)))
      }

      const qrToken = await rotateQrToken(database, parsedObjectNo.data, parsed.data.blockOldToken)

      return regenerateQrResponseSchema.parse({ qrToken })
    },
  )

  app.get<{ Params: { token: string } }>('/api/v1/public/qr/:token', async (request, reply) => {
    const parsed = qrTokenSchema.safeParse(request.params.token)

    if (!parsed.success) {
      return reply.code(400).send(invalidRequest(['token']))
    }

    return resolveQrToken(database, parsed.data)
  })
}
