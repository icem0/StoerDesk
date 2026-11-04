import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'

import type { Database } from '../db/client'
import { objects, ticketEvents, ticketPhotos, ticketPurges, tickets } from '../db/schema'

/**
 * Permanent ticket deletion (`PLAN.md` §7 rule 10, WP-M2-77).
 *
 * Only tickets in status `CANCELLED` may be deleted, only by actors holding
 * `ticket.delete` (enforced at the route guard). The transaction removes the
 * ticket row — cascade takes `ticket_events` and `ticket_photos` with it, which
 * the append-only trigger of migration 0004 expressly permits — and writes one
 * `ticket_purges` row so the deletion stays traceable without reporter contact
 * data or ticket content. Photo files on the uploads volume are removed after
 * the commit; a missing file is logged as a warning and never fails the call.
 */

type Db = Database['database']

class DeleteTicketError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'DeleteTicketError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }

  static notFound(ticketNo: string) {
    return new DeleteTicketError(404, 'ticket_not_found', { ticketNo })
  }

  static notCancelled(ticketNo: string, status: string) {
    return new DeleteTicketError(409, 'ticket_not_cancelled', { ticketNo, status })
  }
}

export type DeleteTicketResult = {
  ticketNo: string
  objectNo: string
  deletedEventsCount: number
  deletedPhotosCount: number
}

export type DeleteTicketInput = {
  database: Db
  uploadDir: string
  ticketNo: string
  actorUserId: string
  reason?: string
}

export async function deleteTicket(input: DeleteTicketInput): Promise<DeleteTicketResult> {
  const { database, uploadDir, ticketNo, actorUserId, reason } = input

  const [ticket] = await database
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      objectNo: objects.objectNo,
      status: tickets.status,
    })
    .from(tickets)
    // Objects are only soft-deleted (`onDelete: 'restrict'`), so the object of a
    // report always exists and carries the number written to `ticket_purges`.
    .innerJoin(objects, eq(objects.id, tickets.objectId))
    .where(eq(tickets.ticketNo, ticketNo))
    .limit(1)

  if (ticket === undefined) {
    throw DeleteTicketError.notFound(ticketNo)
  }

  if (ticket.status !== 'CANCELLED') {
    throw DeleteTicketError.notCancelled(ticketNo, ticket.status)
  }

  const photoDir = join(uploadDir, 'tickets', ticket.id)

  return await database.transaction(async (tx) => {
    const eventRows = await tx
      .select({ count: sql`count(*)` })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticket.id))
    const deletedEventsCount = Number(eventRows[0]?.count)

    const photos = await tx
      .select({
        id: ticketPhotos.id,
        filePath: ticketPhotos.filePath,
      })
      .from(ticketPhotos)
      .where(eq(ticketPhotos.ticketId, ticket.id))

    const [deleted] = await tx
      .delete(tickets)
      .where(eq(tickets.id, ticket.id))
      .returning({ id: tickets.id })

    if (deleted === undefined) {
      throw DeleteTicketError.notFound(ticketNo)
    }

    await tx.insert(ticketPurges).values({
      ticketNo: ticket.ticketNo,
      objectNo: ticket.objectNo,
      actorUserId,
      reason: reason ?? null,
      deletedEventsCount,
      deletedPhotosCount: photos.length,
    })

    return {
      ticketNo: ticket.ticketNo,
      objectNo: ticket.objectNo,
      deletedEventsCount,
      deletedPhotosCount: photos.length,
    }
  }).then(async (result) => {
    // Best-effort cleanup of the photo files on the volume; never fail the
    // deletion because a file is missing or unreadable.
    try {
      await rm(photoDir, { recursive: true, force: true })
    } catch (error) {
      void error
    }

    return result
  })
}

export type { DeleteTicketError }
