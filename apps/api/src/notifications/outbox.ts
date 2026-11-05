import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { outbox } from '../db/schema'
import { configuredChannels } from './channels/index'

type Db = Database['database']

/** The insert capability — enough for both the live database and a transaction node. */
type DbLike = Pick<Db, 'insert'>

/** One notification queued for one channel — the insert shape of an `outbox` row. */
export interface OutboxRow {
  ticketId: string
  channel: string
  target: Record<string, unknown>
}

/**
 * The ticket facts an outbox row is created for. Only machine-readable message
 * parameters travel here: ticket number, priority and object name. No photo, no
 * contact data (`PLAN.md` §12 message content, WP-M7-04).
 */
export interface OutboxTicket {
  id: string
  ticketNo: string
  priority: string
  objectName: string
}

/**
 * The message parameters every row of a ticket carries. They are never
 * translated text — status and priority stay English, the labels come from
 * i18n in the web layer (`PLAN.md` §3).
 */
const messageParams = (ticket: OutboxTicket): Record<string, unknown> => ({
  ticketNo: ticket.ticketNo,
  priority: ticket.priority,
  objectName: ticket.objectName,
})

/**
 * Builds one `PENDING` row per configured channel. `state`, `attempts`,
 * `created_at` and `updated_at` come from the column defaults of migration 0019
 * — the enqueue never sets them, so draining (WP-M7-04b) reads them consistently.
 */
function outboxRows(ticket: OutboxTicket, env: Env): OutboxRow[] {
  const params = messageParams(ticket)

  return configuredChannels(env).map((channel) => ({
    ticketId: ticket.id,
    channel: channel.name,
    target: params,
  }))
}

/**
 * Writes the notification outbox rows for a freshly created ticket, inside the
 * same transaction the caller is in. It only inserts — there is deliberately no
 * HTTP call, so a channel failure can never lose the ticket event (`PLAN.md` §12).
 * Returns the number of rows written; an unconfigured environment writes none.
 */
export async function enqueueOutbox(database: DbLike, ticket: OutboxTicket, env: Env): Promise<number> {
  const rows = outboxRows(ticket, env)

  if (rows.length === 0) {
    return 0
  }

  await database.insert(outbox).values(rows)

  return rows.length
}
