import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { objects, tickets } from '../db/schema'
import { enqueuePersonalDeliveries } from './outbox'
import { escalationRecipients } from './receivers'

/**
 * The notices of an assignment (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-07).
 *
 * Two recipients are addressed (decision 5 of ADR-0039):
 *
 * - the **assigned technician** receives `ticket.assigned` when the ticket is
 *   assigned to him;
 * - the **assigner** — the user who made the assignment — receives
 *   `ticket.assignment_answered` when the technician accepts or declines the
 *   ticket. A rule-made assignment has no assigner and notifies nobody.
 *
 * The way is the one the recipient chose for the event type (§11.4, ADR-0037):
 * one row per channel the recipient selected, plus the personal fallback of
 * ADR-0037 for a recipient without a selection.
 */

type Db = Database['database']

type TicketFacts = {
  ticketNo: string
  priority: string
  objectName: string
}

async function readTicketFacts(database: Db, ticketId: string): Promise<TicketFacts | null> {
  const rows = await database
    .select({
      ticketNo: tickets.ticketNo,
      priority: tickets.priority,
      objectName: objects.name,
    })
    .from(tickets)
    .innerJoin(objects, eq(objects.id, tickets.objectId))
    .where(eq(tickets.id, ticketId))
    .limit(1)

  const ticket = rows[0]

  if (ticket === undefined) {
    return null
  }

  return {
    ticketNo: ticket.ticketNo,
    priority: ticket.priority,
    objectName: ticket.objectName,
  }
}

/**
 * The notice of the assignment: the technician receives `ticket.assigned` over
 * the channels he chose for that event type. The rule of the escalation (its
 * key and its stage) travels with the message when the assignment came from a
 * rule.
 */
export async function notifyAssignee(
  database: Db,
  input: {
    ticketId: string
    userId: string
    ruleKey?: string | null
    stageKey?: string | null
  },
): Promise<number> {
  const recipients = await escalationRecipients(database, 'ticket.assigned', [input.userId])

  if (recipients.length === 0) {
    return 0
  }

  const ticket = await readTicketFacts(database, input.ticketId)

  if (ticket === null) {
    return 0
  }

  await enqueuePersonalDeliveries(
    database,
    recipients.map((recipient) => ({
      userId: recipient.userId,
      channel: recipient.channel,
      eventType: 'ticket.assigned',
      title: ticket.ticketNo,
      body: [ticket.priority, ticket.objectName, input.ruleKey, input.stageKey]
        .filter((value) => value !== '' && value !== undefined && value !== null)
        .join(' · '),
      ticketId: input.ticketId,
      target: {
        ticketNo: ticket.ticketNo,
        priority: ticket.priority,
        objectName: ticket.objectName,
        ...(input.ruleKey === undefined || input.ruleKey === null
          ? {}
          : { escalationRule: input.ruleKey }),
        ...(input.stageKey === undefined || input.stageKey === null
          ? {}
          : { escalationStage: input.stageKey }),
        ...(recipient.topic === '' ? {} : { ntfyTopic: recipient.topic }),
      },
    })),
  )

  return recipients.length
}

/**
 * The notice of the answer: the assigner receives `ticket.assignment_answered`
 * over the channels he chose for that event type. A recipient without a
 * selection keeps his own ntfy topic (ADR-0037).
 */
export async function notifyAssigner(
  database: Db,
  input: {
    ticketId: string
    userId: string
    answer: 'accepted' | 'declined'
    /** The name of the technician who answered — the display name, no contact value. */
    assigneeName: string
  },
): Promise<number> {
  const recipients = await escalationRecipients(database, 'ticket.assignment_answered', [
    input.userId,
  ])

  if (recipients.length === 0) {
    return 0
  }

  const ticket = await readTicketFacts(database, input.ticketId)

  if (ticket === null) {
    return 0
  }

  await enqueuePersonalDeliveries(
    database,
    recipients.map((recipient) => ({
      userId: recipient.userId,
      channel: recipient.channel,
      eventType: 'ticket.assignment_answered',
      title: ticket.ticketNo,
      body: [ticket.priority, ticket.objectName, input.answer, input.assigneeName]
        .filter((value) => value !== '' && value !== undefined && value !== null)
        .join(' · '),
      ticketId: input.ticketId,
      target: {
        ticketNo: ticket.ticketNo,
        priority: ticket.priority,
        objectName: ticket.objectName,
        answer: input.answer,
        assigneeName: input.assigneeName,
        ...(recipient.topic === '' ? {} : { ntfyTopic: recipient.topic }),
      },
    })),
  )

  return recipients.length
}
