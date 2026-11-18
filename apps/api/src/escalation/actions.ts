import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  ESCALATION_NOTIFY_PRIORITIES,
  evaluateEscalationCondition,
  escalationNotifyTargetSchema,
  escalationTargetSchema,
  NTFY_PRIORITY_NUMBERS,
  type EscalationCondition,
  type EscalationFacts,
  type EscalationNotifyPriority,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import {
  escalationActions,
  objects,
  outbox,
  ticketAssignees,
  ticketEvents,
  tickets,
  webhookDeliveries,
  webhookEndpoints,
} from '../db/schema'
import { ntfyTopicsOfUsers } from '../notifications/receivers'
import { enqueuePersonalDeliveries } from '../notifications/outbox'
import { resolveOnDutyUserIds } from '../oncall/coupling'
import { transitionTicket } from '../tickets/workflow'
import { readTicketTransitions } from '../tickets/transition-service'
import { distributeTicket } from './distribution'

/**
 * The actions of a fired rule (`specs/07-escalation.md` §7.5, ADR-0017,
 * WP-M13-07b).
 *
 * `notify` writes one outbox row per selected channel, `webhook` one delivery
 * row per selected endpoint, `history` one normal comment in the ticket
 * history and `status_change` performs the step of the `ticket_transitions`
 * table that leads from the current status of the ticket to the configured
 * target (§7.5, §7.13, ADR-0025, WP-M14-40b) and appends one `escalation_note`
 * event documenting the change. The `offer` and the `assign` action
 * distribute the ticket (§7.14, ADR-0026): they hand it to the
 * technicians of their target. A `notify` action with a readiness pool as its
 * target reaches the technicians who have a shift in that pool at this moment
 * (ADR-0030); the target `assigned` reaches the technicians of the ticket
 * (ADR-0033). Every action carries its own condition: an
 * action whose condition does not match does not run. Apart from the two
 * distribution actions no action changes an assignment, a priority, a deadline
 * or a work order.
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
  /** The ticket status the `status_change` actions moved (WP-M14-40b). */
  statusChanged: number
  /** The tickets the `offer` actions distributed (WP-M14-82). */
  offered: number
  /** The tickets the `assign` actions distributed (WP-M14-82). */
  assigned: number
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
 * The assignees of the ticket (§7.14, ADR-0033): the technicians the
 * escalation assigned and the technicians who took the ticket themselves. The
 * target `assigned` of a `notify` action reaches them.
 */
async function resolveAssigneeIds(database: Db, ticketId: string): Promise<string[]> {
  const rows = await database
    .select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(eq(ticketAssignees.ticketId, ticketId))

  return rows.map((row) => row.userId)
}

/**
 * Runs the actions of a fired rule. The actions are written in the same
 * transaction as the firing, so a rule either runs its actions or nothing.
 */
export async function dispatchEscalationActions(
  database: Db,
  firing: EscalationFiring,
  facts: EscalationFacts,
  at: Date = new Date(),
): Promise<EscalationActionResult> {
  const result: EscalationActionResult = {
    notified: 0,
    webhooks: 0,
    notes: 0,
    statusChanged: 0,
    offered: 0,
    assigned: 0,
  }

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
      status: tickets.status,
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
      if (ticket === undefined) {
        continue
      }

      const priorityLevel =
        typeof config.priority === 'string' &&
        (ESCALATION_NOTIFY_PRIORITIES as readonly string[]).includes(config.priority)
          ? (config.priority as EscalationNotifyPriority)
          : undefined
      const ntfyPriority =
        priorityLevel === undefined ? undefined : NTFY_PRIORITY_NUMBERS[priorityLevel]
      const target = {
        ticketNo: ticket.ticketNo,
        priority: ticket.priority,
        objectName: ticket.objectName,
        escalationRule: firing.ruleKey,
        escalationStage: firing.stageKey,
        ...(ntfyPriority === undefined ? {} : { ntfyPriority }),
      }
      const notifyTarget = escalationNotifyTargetSchema.safeParse(config.target)

      if (notifyTarget.success) {
        // A readiness pool as the target reaches the technicians who have a
        // shift in that pool at this moment (ADR-0030) — the members of the
        // pool without a shift receive nothing. The target `assigned` reaches
        // the technicians of the ticket (ADR-0033).
        const userIds =
          notifyTarget.data.kind === 'user'
            ? [notifyTarget.data.id]
            : notifyTarget.data.kind === 'pool'
              ? await resolveOnDutyUserIds(database, notifyTarget.data.id, at)
              : await resolveAssigneeIds(database, firing.ticketId)
        const recipients = await ntfyTopicsOfUsers(database, 'ticket.escalated', userIds)

        if (recipients.length === 0) {
          continue
        }

        // The personal deliveries of the escalation (WP-M14-120b): each
        // notified user gets a message row next to the outbox row, so the
        // inbox shows the escalation and whether it arrived.
        await enqueuePersonalDeliveries(
          database,
          recipients.map((recipient) => ({
            userId: recipient.userId,
            channel: 'ntfy',
            eventType: 'ticket.escalated',
            title: ticket.ticketNo,
            body: [
              target.priority,
              target.objectName,
              target.escalationRule,
              target.escalationStage,
            ]
              .filter((value) => value !== '' && value !== undefined)
              .join(' · '),
            ticketId: firing.ticketId,
            target: { ...target, ntfyTopic: recipient.topic },
          })),
        )

        result.notified += recipients.length
        continue
      }

      const channels = stringList(config.channels)

      if (channels.length === 0) {
        continue
      }

      await database.insert(outbox).values(
        channels.map((channel) => ({
          ticketId: firing.ticketId,
          eventType: 'ticket.escalated',
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
      const text = typeof config.text === 'string' ? config.text.trim() : ''

      if (text === '') {
        continue
      }

      // The configured text is a normal ticket comment, not an escalation
      // note: the ticket history renders it like every other comment
      // (WP-M14-93).
      await database.insert(ticketEvents).values({
        ticketId: firing.ticketId,
        type: 'comment',
        actorKind: 'system',
        payload: { text },
      })

      result.notes += 1
      continue
    }

    if (row.type === 'status_change') {
      const toStatus = typeof config.toStatus === 'string' ? config.toStatus : undefined

      if (toStatus === undefined || ticket === undefined) {
        continue
      }

      const from = ticket.status
      const transitions = await readTicketTransitions(database)
      const step = transitions.find(
        (transition) =>
          transition.active && transition.fromStatus === from && transition.toStatus === toStatus,
      )

      // Without an active step to the target the action changes nothing (§7.13).
      if (step === undefined) {
        continue
      }

      await transitionTicket({
        database,
        ticketId: firing.ticketId,
        event: step.eventKey,
        actorKind: 'system',
        payload: { rule: firing.ruleKey, stage: firing.stageKey },
      })

      await database.insert(ticketEvents).values({
        ticketId: firing.ticketId,
        type: 'escalation_note',
        actorKind: 'system',
        payload: {
          rule: firing.ruleKey,
          stage: firing.stageKey,
          from,
          to: toStatus,
        },
      })

      result.statusChanged += 1
      continue
    }

    if (row.type === 'offer' || row.type === 'assign') {
      const parsed = escalationTargetSchema.safeParse(config.target)

      if (!parsed.success || ticket === undefined) {
        continue
      }

      const outcome = await distributeTicket(database, {
        ticketId: firing.ticketId,
        target: parsed.data,
        kind: row.type,
        ruleKey: firing.ruleKey,
        stageKey: firing.stageKey,
      })

      if (outcome.changed) {
        if (row.type === 'offer') {
          result.offered += 1
        } else {
          result.assigned += 1
        }
      }

      continue
    }
  }

  return result
}
