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
  type EscalationNotifyTarget,
  type EscalationTarget,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import {
  escalationActions,
  objects,
  oncallPools,
  outbox,

  ticketEvents,
  tickets,
  users,
  webhookDeliveries,
  webhookEndpoints,
} from '../db/schema'
import { personalRecipients } from '../notifications/receivers'
import { enqueuePersonalDeliveries } from '../notifications/outbox'
import { resolveOnDutyUserIds } from '../oncall/coupling'
import { assignTicketByEscalation, distributeTicket } from './distribution'

/**
 * The actions of a fired rule (`specs/07-escalation.md` §7.5, ADR-0017,
 * WP-M13-07b).
 *
 * `notify` writes one outbox row per selected channel, `webhook` one delivery
 * row per selected endpoint, `history` one normal comment in the ticket
 * history and `status_change` sets the status of the ticket to the configured
 * target and appends one `escalation_note` event documenting the change
 * (§7.5, ADR-0027). The `offer` and the `assign` action
 * distribute the ticket (§7.14, ADR-0026): they hand it to the
 * technicians of their target. A `notify` action with a readiness pool as its
 * target reaches the technicians who have a shift in that pool at this moment
 * (ADR-0030); the target `assigned` reaches the technicians of the ticket
 * (ADR-0033). The way of such a notification is the one the recipient chose
 * for `ticket.escalated` (ADR-0037); without a target the action keeps the
 * broadcast over the channels of the installation. Every action carries its own condition: an
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
 * The name of the target a `notify` action was configured for (§7.5, §11.8,
 * WP-M14-152b): the name of the readiness pool or the name of the user — given
 * and family name, the e-mail only as the fallback like the inbox of §11.16.
 * The target `assigned` names the technicians of the ticket, who are already
 * visible on the ticket, so it has no single name.
 */
async function targetNameOf(
  database: Db,
  target: EscalationNotifyTarget,
): Promise<string | null> {
  if (target.kind === 'pool') {
    const [pool] = await database
      .select({ name: oncallPools.name })
      .from(oncallPools)
      .where(eq(oncallPools.id, target.id))
      .limit(1)

    return pool?.name ?? null
  }

  if (target.kind === 'user') {
    const [user] = await database
      .select({ givenName: users.givenName, familyName: users.familyName, email: users.email })
      .from(users)
      .where(eq(users.id, target.id))
      .limit(1)

    if (user === undefined) {
      return null
    }

    const name = `${user.givenName} ${user.familyName}`.trim()

    return name === '' ? user.email : name
  }

  return null
}

/**
 * The recipients of the targets `assigned` and `assigner` (§7.14, ADR-0039):
 * the technician of the ticket and the user who made the assignment. A ticket
 * without an assignee or without an assigner reaches nobody.
 */
async function resolveAssignmentTarget(
  database: Db,
  ticketId: string,
  kind: 'assigned' | 'assigner',
): Promise<string[]> {
  const rows = await database
    .select({
      assignedUserId: tickets.assignedUserId,
      assignedByUserId: tickets.assignedByUserId,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  const ticket = rows[0]
  const userId = kind === 'assigned' ? ticket?.assignedUserId : ticket?.assignedByUserId

  if (userId === null || userId === undefined) {
    return []
  }

  return [userId]
}

/**
 * The target of an `assign` action (§7.14, ADR-0057): a readiness pool, a
 * user group or one technician. A stored action of the former shape carries
 * the mode and the technician instead — it stays readable until WP-M32-05
 * removes it.
 */
function assignTargetOf(config: Record<string, unknown>): EscalationTarget | null {
  const target = config.target as { kind?: string; id?: string } | undefined

  if (
    target !== undefined &&
    (target.kind === 'pool' || target.kind === 'group' || target.kind === 'user') &&
    typeof target.id === 'string'
  ) {
    return { kind: target.kind, id: target.id }
  }

  return null
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
      reporterEmail: tickets.reporterEmail,
      customerEmailNotifications: tickets.customerEmailNotifications,
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

    if (row.type === 'notify_reporter') {
      // §19.8 (ADR-0056): the report of the reporter. The opt-in of the
      // reporter decides whether the mail goes out — a ticket without it is
      // skipped, and a ticket without an address has nobody to write to.
      if (
        ticket === undefined ||
        ticket.reporterEmail === null ||
        ticket.reporterEmail === '' ||
        !ticket.customerEmailNotifications
      ) {
        continue
      }

      await database.insert(outbox).values({
        ticketId: firing.ticketId,
        eventType: 'ticket.reporter',
        channel: 'email',
        target: {
          ticketNo: ticket.ticketNo,
          priority: ticket.priority,
          objectName: ticket.objectName,
          escalationRule: firing.ruleKey,
          escalationStage: firing.stageKey,
          recipientTarget: ticket.reporterEmail,
          reporterMail: true,
        },
      })

      result.notified += 1
      continue
    }

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
        // The name of the configured target goes into the row target, so the
        // notification event of the drain can name the pool or the user the
        // rule was configured for (§11.8, WP-M14-152b).
        const targetName = await targetNameOf(database, notifyTarget.data)
        const rowTarget = targetName === null ? target : { ...target, targetName }

        // A readiness pool as the target reaches the technicians who have a
        // shift in that pool at this moment (ADR-0030) — the members of the
        // pool without a shift receive nothing. The target `assigned` reaches
        // the technicians of the ticket (ADR-0033).
        const userIds =
          notifyTarget.data.kind === 'user'
            ? [notifyTarget.data.id]
            : notifyTarget.data.kind === 'pool'
              ? await resolveOnDutyUserIds(database, notifyTarget.data.id, at)
              : await resolveAssignmentTarget(database, firing.ticketId, notifyTarget.data.kind)
        const recipients = await personalRecipients(database, userIds)

        if (recipients.length === 0) {
          continue
        }

        // The personal deliveries of the escalation (WP-M14-120b): each
        // notified user gets a message row next to the outbox row, so the
        // inbox shows the escalation and whether it arrived. The way is the
        // one the recipient chose for `ticket.escalated` (ADR-0037); only ntfy
        // knows the personal address of the recipient.
        await enqueuePersonalDeliveries(
          database,
          recipients.map((recipient) => ({
            userId: recipient.userId,
            channel: recipient.channel,
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
            target: {
              ...rowTarget,
              ...(recipient.target === '' ? {} : { recipientTarget: recipient.target }),
              ...(recipient.channel === 'ntfy' && recipient.target !== ''
                ? { ntfyTopic: recipient.target }
                : {}),
            },
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

      // The stage sets the status directly (ADR-0027): no transition table and
      // no check of the previous status. The history documents the change.
      await database
        .update(tickets)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(eq(tickets.id, firing.ticketId))

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

    if (row.type === 'offer') {
      const parsed = escalationTargetSchema.safeParse(config.target)

      if (!parsed.success || ticket === undefined) {
        continue
      }

      const outcome = await distributeTicket(database, {
        ticketId: firing.ticketId,
        target: parsed.data,
        kind: 'offer',
        ruleKey: firing.ruleKey,
        stageKey: firing.stageKey,
      })

      if (outcome.changed) {
        result.offered += 1
      }

      continue
    }

    if (row.type === 'assign') {
      // The assignment hands the ticket to **one** technician (§7.14, ADR-0039,
      // ADR-0057): the first member of the target — a readiness pool, a user
      // group or one technician.
      const acceptance = config.acceptance !== false
      const target = assignTargetOf(config)

      if (target !== null) {
        if (ticket === undefined) {
          continue
        }

        const outcome = await assignTicketByEscalation(database, {
          ticketId: firing.ticketId,
          target,
          acceptance,
          ruleKey: firing.ruleKey,
          stageKey: firing.stageKey,
        })

        if (outcome.changed) {
          result.assigned += 1
        }

        continue
      }

      // A stored action of the former shape (ADR-0039, decision 3) carries no
      // target — the migration of WP-M32-05 removes those actions.
      continue
    }
  }

  return result
}
