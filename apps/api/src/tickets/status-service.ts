import { asc, eq, sql } from 'drizzle-orm'
import {
  ticketStatusInUseCode,
  ticketStatusKeyTakenCode,
  ticketStatusLastActiveCode,
  ticketStatusNotFoundCode,
  ticketStatusResponseSchema,
  type TicketStatusCreateRequest,
  type TicketStatusResponse,
  type TicketStatusUpdateRequest,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { ticketStatuses, tickets } from '../db/schema'

/**
 * The ticket statuses of the installation (`specs/07-escalation.md` §7.1,
 * WP-M14-35, WP-M14-36).
 *
 * The status of a ticket is a machine key of the `ticket_statuses` table, so the
 * administration reads, creates, edits and deletes rows. A status that at least
 * one ticket carries is never deleted (`409 status_in_use`) and the last active
 * status is never switched off or deleted (`409 status_last_active`) — a ticket
 * always has a status it can be shown with. The key of an existing status is
 * immutable: the workflow, the escalation stages and the tickets reference it.
 */

type Db = Database['database']

export class TicketStatusServiceError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TicketStatusServiceError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
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

/** The tickets that currently carry this status key. */
async function statusUsageCount(database: Db, key: string): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(${tickets.status})` })
    .from(tickets)
    .where(eq(tickets.status, key))

  return Number(row?.total ?? 0)
}

/** The active rows — the last one is never switched off or deleted. */
async function activeStatusCount(database: Db): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(${ticketStatuses.key})` })
    .from(ticketStatuses)
    .where(sql`${ticketStatuses.active} = true`)

  return Number(row?.total ?? 0)
}

export async function readTicketStatuses(database: Db): Promise<TicketStatusResponse[]> {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(ticketStatuses)
      .orderBy(asc(ticketStatuses.position), asc(ticketStatuses.key)),
    database
      .select({ status: tickets.status, total: sql<number>`count(${tickets.status})` })
      .from(tickets)
      .groupBy(tickets.status),
  ])

  const countOf = new Map<string, number>(
    counts.map((row) => [row.status, Number(row.total ?? 0)]),
  )

  return rows.map((row) => ticketStatusResponseSchema.parse({
    key: row.key,
    nameDe: (row.names as Record<string, string>).de ?? '',
    nameEn: (row.names as Record<string, string>).en ?? '',
    color: row.color,
    position: row.position,
    active: row.active,
    isTerminal: row.isTerminal,
    ticketCount: countOf.get(row.key) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function createTicketStatus(
  database: Db,
  body: TicketStatusCreateRequest,
): Promise<TicketStatusResponse> {
  try {
    const [row] = await database
      .insert(ticketStatuses)
      .values({
        key: body.key,
        names: { de: body.nameDe, en: body.nameEn },
        color: body.color,
        position: body.position,
        active: body.active,
        isTerminal: body.isTerminal,
      })
      .returning()

    if (row === undefined) {
      throw new TicketStatusServiceError(500, 'ticket_status_create_failed')
    }

    return ticketStatusResponseSchema.parse({
      key: row.key,
      nameDe: (row.names as Record<string, string>).de ?? '',
      nameEn: (row.names as Record<string, string>).en ?? '',
      color: row.color,
      position: row.position,
      active: row.active,
      isTerminal: row.isTerminal,
      ticketCount: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TicketStatusServiceError(409, ticketStatusKeyTakenCode, { fields: ['key'] })
    }

    throw error
  }
}

export async function updateTicketStatus(
  database: Db,
  key: string,
  body: TicketStatusUpdateRequest,
): Promise<TicketStatusResponse> {
  const [current] = await database
    .select()
    .from(ticketStatuses)
    .where(eq(ticketStatuses.key, key))
    .limit(1)

  if (current === undefined) {
    throw new TicketStatusServiceError(404, ticketStatusNotFoundCode, { fields: ['key'] })
  }

  if (body.active === false && current.active) {
    const active = await activeStatusCount(database)

    if (active <= 1) {
      throw new TicketStatusServiceError(409, ticketStatusLastActiveCode, {
        fields: ['active'],
        key,
      })
    }
  }

  const names = { ...(current.names as Record<string, string>) }

  if (body.nameDe !== undefined) {
    names.de = body.nameDe
  }

  if (body.nameEn !== undefined) {
    names.en = body.nameEn
  }

  const [updated] = await database
    .update(ticketStatuses)
    .set({
      names,
      color: body.color ?? current.color,
      position: body.position ?? current.position,
      active: body.active ?? current.active,
      isTerminal: body.isTerminal ?? current.isTerminal,
      updatedAt: new Date(),
    })
    .where(eq(ticketStatuses.key, key))
    .returning()

  if (updated === undefined) {
    throw new TicketStatusServiceError(404, ticketStatusNotFoundCode, { fields: ['key'] })
  }

  return ticketStatusResponseSchema.parse({
    key: updated.key,
    nameDe: (updated.names as Record<string, string>).de ?? '',
    nameEn: (updated.names as Record<string, string>).en ?? '',
    color: updated.color,
    position: updated.position,
    active: updated.active,
    isTerminal: updated.isTerminal,
    ticketCount: await statusUsageCount(database, updated.key),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}

export async function deleteTicketStatus(
  database: Db,
  key: string,
): Promise<TicketStatusResponse> {
  const [current] = await database
    .select()
    .from(ticketStatuses)
    .where(eq(ticketStatuses.key, key))
    .limit(1)

  if (current === undefined) {
    throw new TicketStatusServiceError(404, ticketStatusNotFoundCode, { fields: ['key'] })
  }

  const used = await statusUsageCount(database, key)

  if (used > 0) {
    throw new TicketStatusServiceError(409, ticketStatusInUseCode, {
      fields: ['key'],
      key,
      usageCount: used,
    })
  }

  if (current.active) {
    const active = await activeStatusCount(database)

    if (active <= 1) {
      throw new TicketStatusServiceError(409, ticketStatusLastActiveCode, {
        fields: ['key'],
        key,
      })
    }
  }

  await database
    .delete(ticketStatuses)
    .where(eq(ticketStatuses.key, key))

  return ticketStatusResponseSchema.parse({
    key,
    nameDe: (current.names as Record<string, string>).de ?? '',
    nameEn: (current.names as Record<string, string>).en ?? '',
    color: current.color,
    position: current.position,
    active: current.active,
    isTerminal: current.isTerminal,
    ticketCount: used,
    createdAt: current.createdAt.toISOString(),
    updatedAt: current.updatedAt.toISOString(),
  })
}
