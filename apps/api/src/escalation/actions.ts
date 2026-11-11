import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  evaluateEscalationCondition,
  type EscalationCondition,
  type EscalationFacts,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import {
  escalationActions,
  objects,
  outbox,
  ticketEvents,
  tickets,
  webhookDeliveries,
  webhookEndpoints,
} from '../db/schema'

/**
 * The actions of a fired rule (`specs/07-escalation.md` §7.5, ADR-0017,
 * WP-M13-07b).
 *
 * `notify` writes one outbox row per selected channel, `webhook` one delivery
 * row per selected endpoint and `history` one append-only note in the ticket
 * history. Every action carries its own condition: an action whose condition
 * does not match does not run. None of the actions changes a ticket.
 */

type Db = Database['database']

export type EscalationFiring = {
  ticketId: string
  ruleKey: string
  stageKey: string | null
  /** The `escalated` event of the firing; the webhook delivery refers to it. */
  eventId: string
}

export type EscalationActionResult = {
  notified: number
  webhooks: number
  notes: number
}

type ActionRow = {
  key: string
  type: string
  config: unknown
  condition: unknown
}

function configOf(row: ActionRow): Record<string, unknown> {
  return typeof row.config === 'object' && row.config !== null
    ? (row.config as Record<string, unknown>)
    : {}
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/**
 * Runs the actions of a fired rule. The actions are written in the same
 * transaction as the firing, so a rule either runs its actions or nothing.
 */
export async function dispatchEscalationActions(
  database: Db,
  firing: EscalationFiring,
  facts: EscalationFacts,
): Promise<EscalationActionResult> {
  const result: EscalationActionResult = { notified: 0, webhooks: 0, notes: 0 }

  const rows = await database
    .select()
    .from(escalationActions)
    .where(
      and(
        eq(escalationActions.ruleKey, firing.ruleKey),
        eq(escalationActions.active, true),
      ),
    )
    .orderBy(asc(escalationActions.position))

  if (rows.length === 0) {
    return result
  }

  const ticketRows = await database
    .select({
      ticketNo: tickets.ticketNo,
      priority: tickets.priority,
      objectName: objects.name,
    })
    .from(tickets)
    .innerJoin(objects, eq(objects.id, tickets.objectId))
    .where(eq(tickets.id, firing.ticketId))
    .limit(1)

  const ticket = ticketRows[0]

  for (const row of rows) {
    const condition = row.condition as EscalationCondition

    if (!evaluateEscalationCondition(condition, facts)) {
      continue
    }

    const config = configOf(row)

    if (row.type === 'notify') {
      const channels = stringList(config.channels)

      if (channels.length === 0 || ticket === undefined) {
        continue
      }

      const target = {
        ticketNo: ticket.ticketNo,
        priority: ticket.priority,
        objectName: ticket.objectName,
        escalationRule: firing.ruleKey,
        escalationStage: firing.stageKey,
      }

      await database.insert(outbox).values(
        channels.map((channel) => ({
          ticketId: firing.ticketId,
          channel,
          target,
        })),
      )

      result.notified += channels.length
      continue
    }

    if (row.type === 'webhook') {
      const endpointIds = stringList(config.endpointIds)

      if (endpointIds.length === 0) {
        continue
      }

      const endpoints = await database
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(
          and(
            inArray(webhookEndpoints.id, endpointIds),
            eq(webhookEndpoints.active, true),
          ),
        )

      if (endpoints.length === 0) {
        continue
      }

      const inserted = await database
        .insert(webhookDeliveries)
        .values(
          endpoints.map((endpoint) => ({
            endpointId: endpoint.id,
            eventId: firing.eventId,
            eventType: 'ticket.escalated',
          })),
        )
        .onConflictDoNothing()
        .returning({ id: webhookDeliveries.id })

      result.webhooks += inserted.length
      continue
    }

    if (row.type === 'history') {
      const text = typeof config.text === 'string' ? config.text : undefined

      await database.insert(ticketEvents).values({
        ticketId: firing.ticketId,
        type: 'escalation_note',
        actorKind: 'system',
        payload: {
          rule: firing.ruleKey,
          stage: firing.stageKey,
          ...(text === undefined ? {} : { text }),
        },
      })

      result.notes += 1
    }
  }

  return result
}
