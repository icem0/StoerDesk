import { and, asc, eq } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  PERMISSIONS,
  personalDataEraseRequestSchema,
  personalDataEraseResponseSchema,
  personalDataExportResponseSchema,
  ticketNoSchema,
  type PersonalDataExport,
  type PersonalDataEraseResponse,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import { ticketEvents, ticketPhotos, tickets } from '../db/schema'

/**
 * Personal-data export and erasure (`specs/14-nfr.md` §15.2, ADR-0014 decision 4,
 * WP-M10-16).
 *
 * Both routes are session-only administration guarded by `user.write` — no API-key
 * scope reaches them. The export answers the data of the data subject only: the
 * reporter contact fields, the photo metadata and the machine-readable audit rows
 * without payload, so neither the status token nor the internal notes of other
 * users can leave through it. Erasure nulls the three contact fields and appends
 * one `personal_data_erased` event carrying the reason length and the actor; the
 * ticket and its trail stay, full deletion remains `ticket.delete` (WP-M2-77).
 */

const PERSONAL_DATA_ERASED = 'personal_data_erased'

class PrivacyRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'PrivacyRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

/**
 * The personal data of one ticket: reporter contact fields, photo metadata and
 * the event rows without their payloads, ordered by `created_at`.
 */
async function getPersonalDataExport(
  database: Database['database'],
  ticketNo: string,
): Promise<PersonalDataExport> {
  const [ticket] = await database
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      reporterName: tickets.reporterName,
      reporterPhone: tickets.reporterPhone,
      reporterEmail: tickets.reporterEmail,
    })
    .from(tickets)
    .where(eq(tickets.ticketNo, ticketNo))
    .limit(1)

  if (ticket === undefined) {
    throw new PrivacyRouteError(404, 'ticket_not_found', { fields: ['ticketNo'] })
  }

  const photos = await database
    .select({
      id: ticketPhotos.id,
      filePath: ticketPhotos.filePath,
      mimeType: ticketPhotos.mimeType,
      sizeBytes: ticketPhotos.sizeBytes,
      createdAt: ticketPhotos.createdAt,
    })
    .from(ticketPhotos)
    .where(eq(ticketPhotos.ticketId, ticket.id))
    .orderBy(asc(ticketPhotos.createdAt))

  const events = await database
    .select({
      type: ticketEvents.type,
      actorKind: ticketEvents.actorKind,
      actorUserId: ticketEvents.actorUserId,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticket.id))
    .orderBy(asc(ticketEvents.createdAt))

  return {
    ticketNo: ticket.ticketNo,
    reporter: {
      name: ticket.reporterName,
      phone: ticket.reporterPhone,
      email: ticket.reporterEmail,
    },
    photos: photos.map((photo) => ({
      id: photo.id,
      filePath: photo.filePath,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      createdAt: photo.createdAt.toISOString(),
    })),
    events: events.map((event) => ({
      type: event.type,
      actorKind: event.actorKind,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt.toISOString(),
    })),
  }
}

/**
 * Erase the reporter contact data of one ticket idempotently: the three fields
 * become `NULL` and exactly one `personal_data_erased` event is appended — a
 * repeat finds that event, writes nothing and answers `alreadyErased`.
 */
async function erasePersonalData(
  database: Database['database'],
  ticketNo: string,
  actorUserId: string,
  reason: string,
): Promise<PersonalDataEraseResponse> {
  return await database.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: tickets.id, ticketNo: tickets.ticketNo })
      .from(tickets)
      .where(eq(tickets.ticketNo, ticketNo))
      .limit(1)

    if (ticket === undefined) {
      throw new PrivacyRouteError(404, 'ticket_not_found', { fields: ['ticketNo'] })
    }

    const [erasure] = await tx
      .select({ id: ticketEvents.id })
      .from(ticketEvents)
      .where(and(eq(ticketEvents.ticketId, ticket.id), eq(ticketEvents.type, PERSONAL_DATA_ERASED)))
      .limit(1)

    // The update itself is a no-op on a repeat, so it may run unconditionally.
    await tx
      .update(tickets)
      .set({
        reporterName: null,
        reporterPhone: null,
        reporterEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticket.id))
      .execute()

    if (erasure !== undefined) {
      return { ticketNo: ticket.ticketNo, alreadyErased: true }
    }

    await tx
      .insert(ticketEvents)
      .values({
        ticketId: ticket.id,
        type: PERSONAL_DATA_ERASED,
        actorKind: 'user',
        actorUserId,
        payload: { reasonLength: reason.length },
      })
      .execute()

    return { ticketNo: ticket.ticketNo, alreadyErased: false }
  })
}

export type PrivacyRoutesOptions = {
  database: Database['database']
}

export const privacyRoutes = fp<PrivacyRoutesOptions>(
  async (app, { database }) => {
    app.get<{ Params: { ticketNo: string } }>(
      '/api/v1/privacy/tickets/:ticketNo/export',
      { preHandler: requirePermission(database, PERMISSIONS.user.write) },
      async (request, reply) => {
        const { ticketNo } = request.params

        if (!ticketNoSchema.safeParse(ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        try {
          const result = await getPersonalDataExport(database, ticketNo)

          return reply.code(200).send(personalDataExportResponseSchema.parse(result))
        } catch (error) {
          if (error instanceof PrivacyRouteError) {
            return reply.code(error.statusCode).send({ code: error.code, params: error.params })
          }

          throw error
        }
      },
    )

    app.post<{ Params: { ticketNo: string } }>(
      '/api/v1/privacy/tickets/:ticketNo/erase',
      { preHandler: requirePermission(database, PERMISSIONS.user.write) },
      async (request, reply) => {
        const { ticketNo } = request.params
        const actor = request.user

        if (actor === undefined) {
          return reply.code(401).send({ code: 'session_invalid', params: {} })
        }

        if (!ticketNoSchema.safeParse(ticketNo).success) {
          return reply.code(400).send({ code: 'invalid_request', params: { fields: ['ticketNo'] } })
        }

        const body = personalDataEraseRequestSchema.safeParse(request.body ?? {})

        if (!body.success) {
          return reply
            .code(400)
            .send({ code: 'invalid_request', params: { fields: ['reason'] } })
        }

        try {
          const result = await erasePersonalData(database, ticketNo, actor.id, body.data.reason)

          return reply.code(200).send(personalDataEraseResponseSchema.parse(result))
        } catch (error) {
          if (error instanceof PrivacyRouteError) {
            return reply.code(error.statusCode).send({ code: error.code, params: error.params })
          }

          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-privacy-routes' },
)
