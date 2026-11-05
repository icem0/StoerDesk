import { asc, eq, inArray } from 'drizzle-orm'
import fp from 'fastify-plugin'
import {
  computeTicketTimeline,
  PERMISSIONS,
  ticketDetailResponseSchema,
  type TicketDetailResponse,
} from '@stoerdesk/shared'

import { requirePermission } from '../auth/requirePermission'
import type { Database } from '../db/client'
import {
  objects,
  systems,
  ticketEvents,
  ticketPauses,
  ticketPhotos,
  tickets,
  users,
} from '../db/schema'

/**
 * Ticket detail (`PLAN.md` §6/§7, WP-M2-18a).
 *
 * Authenticated `GET /api/v1/tickets/:ticketNo` for staff. Returns the ticket
 * with object info, the append-only event history and photo metadata.
 * Requires `ticket.read`.
 */

type Db = Database['database']

class TicketDetailRouteError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketDetailRouteError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

export async function getTicketDetail(
  database: Db,
  ticketNo: string,
): Promise<TicketDetailResponse> {
  const [ticketRow] = await database
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      objectNo: objects.objectNo,
      objectName: objects.name,
      systemType: systems.type,
      systemLabel: systems.label,
      status: tickets.status,
      priority: tickets.priority,
      title: tickets.title,
      description: tickets.description,
      faultTemplateKeys: tickets.faultTemplateKeys,
      source: tickets.source,
      reportedAt: tickets.reportedAt,
      receivedAt: tickets.receivedAt,
      deadlineAt: tickets.deadlineAt,
      acknowledgedAt: tickets.acknowledgedAt,
      closedAt: tickets.closedAt,
      updatedAt: tickets.updatedAt,
      reporterName: tickets.reporterName,
      reporterPhone: tickets.reporterPhone,
      reporterEmail: tickets.reporterEmail,
      statusToken: tickets.statusToken,
    })
    .from(tickets)
    .innerJoin(objects, eq(tickets.objectId, objects.id))
    .leftJoin(systems, eq(tickets.systemId, systems.id))
    .where(eq(tickets.ticketNo, ticketNo))
    .limit(1)

  if (ticketRow === undefined) {
    throw new TicketDetailRouteError(404, 'ticket_not_found', { fields: ['ticketNo'] })
  }

  const events = await database
    .select({
      id: ticketEvents.id,
      type: ticketEvents.type,
      actorKind: ticketEvents.actorKind,
      actorUserId: ticketEvents.actorUserId,
      payload: ticketEvents.payload,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketRow.id))
    .orderBy(asc(ticketEvents.createdAt))

  const pauses = await database
    .select()
    .from(ticketPauses)
    .where(eq(ticketPauses.ticketId, ticketRow.id))
    .orderBy(asc(ticketPauses.startedAt))

  const photos = await database
    .select({
      id: ticketPhotos.id,
      filePath: ticketPhotos.filePath,
      mimeType: ticketPhotos.mimeType,
      sizeBytes: ticketPhotos.sizeBytes,
      createdAt: ticketPhotos.createdAt,
    })
    .from(ticketPhotos)
    .where(eq(ticketPhotos.ticketId, ticketRow.id))
    .orderBy(asc(ticketPhotos.createdAt))

  const actorUserIds = new Set<string>()
  for (const e of events) {
    if (e.actorUserId !== null && e.actorUserId !== undefined) {
      actorUserIds.add(e.actorUserId)
    }
  }

  const actorNames: Map<string, string> = new Map()
  if (actorUserIds.size > 0) {
    const actorRows = await database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, [...actorUserIds]))

    for (const row of actorRows) {
      actorNames.set(row.id, row.email)
    }
  }

  const terminal = ticketRow.status === 'CLOSED' || ticketRow.status === 'CANCELLED'
  const stoppedAt = ticketRow.acknowledgedAt ??
    (terminal ? (ticketRow.closedAt ?? ticketRow.updatedAt) : null)
  const openPause = pauses.find((pause) => pause.endedAt === null) ?? null
  const markerTypes = new Set([
    'created',
    'review_started',
    'work_order_set',
    'accepted',
    'acknowledged',
  ])
  const timeline = computeTicketTimeline({
    reportedAt: ticketRow.reportedAt,
    deadlineAt: ticketRow.deadlineAt,
    stoppedAt,
    pauses,
  })

  return {
    timeline: {
      ...timeline,
      pause: openPause === null
        ? null
        : {
            id: openPause.id,
            reason: openPause.reason,
            startedAt: openPause.startedAt.toISOString(),
          },
      markers: events
        .filter((event) => markerTypes.has(event.type))
        .map((event) => ({ type: event.type, at: event.createdAt.toISOString() })),
    },
    pauses: pauses.map((pause) => ({
      id: pause.id,
      ticketId: pause.ticketId,
      reason: pause.reason,
      startedAt: pause.startedAt.toISOString(),
      endedAt: pause.endedAt?.toISOString() ?? null,
      startedByUserId: pause.startedByUserId,
      endedByUserId: pause.endedByUserId,
      createdAt: pause.createdAt.toISOString(),
    })),
    ticket: {
      id: ticketRow.id,
      ticketNo: ticketRow.ticketNo,
      objectNo: ticketRow.objectNo,
      objectName: ticketRow.objectName,
      systemType: ticketRow.systemType,
      systemLabel: ticketRow.systemLabel,
      status: ticketRow.status,
      priority: ticketRow.priority,
      title: ticketRow.title,
      description: ticketRow.description,
      faultTemplateKeys: ticketRow.faultTemplateKeys,
      source: ticketRow.source,
      reportedAt: ticketRow.reportedAt.toISOString(),
      receivedAt: ticketRow.receivedAt.toISOString(),
      deadlineAt: ticketRow.deadlineAt.toISOString(),
      reporterName: ticketRow.reporterName,
      reporterPhone: ticketRow.reporterPhone,
      reporterEmail: ticketRow.reporterEmail,
      statusToken: ticketRow.statusToken,
    },
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      actorKind: e.actorKind,
      actorName: e.actorUserId !== null && e.actorUserId !== undefined
        ? (actorNames.get(e.actorUserId) ?? null)
        : null,
      payload: e.payload as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(),
    })),
    photos: photos.map((p) => ({
      id: p.id,
      filePath: p.filePath,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}

export type TicketDetailRouteOptions = {
  database: Db
}

export const ticketDetailRoutes = fp<TicketDetailRouteOptions>(
  async (app, { database }) => {
    app.get<{ Params: { ticketNo: string } }>(
      '/api/v1/tickets/:ticketNo',
      { preHandler: requirePermission(database, PERMISSIONS.ticket.read) },
      async (request, reply) => {
        const { ticketNo } = request.params

        try {
          const result = await getTicketDetail(database, ticketNo)
          return reply.code(200).send(ticketDetailResponseSchema.parse(result))
        } catch (error) {
          if (error instanceof TicketDetailRouteError) {
            return reply.code(error.statusCode).send({ code: error.code, params: error.params })
          }
          throw error
        }
      },
    )
  },
  { name: 'stoerdesk-ticket-detail' },
)
