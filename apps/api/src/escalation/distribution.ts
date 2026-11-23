import type { EscalationTarget } from '@stoerdesk/shared'
import { and, eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { objects, ticketAssignees, ticketEvents, tickets, users } from '../db/schema'
import { enqueuePersonalDeliveries } from '../notifications/outbox'
import { escalationRecipients } from '../notifications/receivers'
import { resolveOnCallPerson } from '../oncall/coupling'
import { resolveGroupMemberIds, resolvePoolMemberIds } from '../oncall/members'
import { readOncallSettings } from '../oncall/settings'
import { assignTicket, type AssignResult } from '../tickets/assignment'
import { TicketTransitionError, transitionTicket } from '../tickets/workflow'
import { firstAssignee, resolveAssigneePool } from './assignee-pool'

/**
 * The distribution of a ticket by the escalation (`specs/07-escalation.md`
 * §7.14, ADR-0026, WP-M14-82).
 *
  * The `offer` and the `assign` action of a fired rule hand the ticket to the
 * technicians of a target — a readiness pool or a user group. Both set their
 * workflow status through the event (`offered` or `assigned`, ADR-0027): the
 * offer sets `OFFERED`, the assignment sets `ASSIGNED`. A ticket whose
 * technicians are missing keeps its status and the action changes nothing.

 *
 * The assignment records the technicians in `ticket_assignees`
 * (`specs/02-data-model.md` §4.13); the offer names the on-call person of a
 * pool in `offered_to_user_id` and sets the offer timeout (WP-M14-82b), a user
 * target names that technician (ADR-0033). Every
 * distribution writes one append-only `escalation_note` event and queues one
 * outbox row per technician over the way the technician chose for the event
 * (ADR-0037).
 */

type Db = Database['database']

/** The two distributions of §7.14. */
export type DistributionKind = 'offer' | 'assign'

export type DistributionResult = {
  /** False when the ticket was not changed (no technician, or the ticket is gone). */
  changed: boolean
  /** The number of the technicians of the target. */
  technicians: number
  /** The number of the queued rows (one per technician and way). */
  notified: number
}

/**
 * The technicians of a target: the members of a readiness pool or of a user
 * group, or one technician of the installation — a user target is that user,
 * if the account is active (§7.14, ADR-0033). A deactivated account is nobody,
 * so a target without a technician changes nothing.
 */
export async function resolveTargetTechnicians(
  database: Db,
  target: EscalationTarget,
): Promise<string[]> {
  if (target.kind === 'user') {
    const rows = await database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, target.id), eq(users.active, true)))

    return rows.map((row) => row.id)
  }

  return target.kind === 'pool'
    ? resolvePoolMemberIds(database, target.id)
    : resolveGroupMemberIds(database, target.id)
}

/**
  * The offer names the on-call person of a pool and sets the offer timeout
 * (§7.14, WP-M14-82b): the payload for the `offered` event. A group target and a pool without a covering shift offer without a
 * person and without a timeout — the whole group receives the offer. A user
 * target names that technician (§7.14, ADR-0033).
 */
async function offerPayload(
  database: Db,
  target: EscalationTarget,
  now: Date,
): Promise<Record<string, unknown>> {
  if (target.kind === 'user') {
    return { offeredToUserId: target.id }
  }

  if (target.kind !== 'pool') {
    return {}
  }

  const resolution = await resolveOnCallPerson(database, { at: now, poolId: target.id })

  if (resolution.kind === 'unstaffed' || resolution.userId === undefined) {
    return {}
  }

  const settings = await readOncallSettings(database)
  const offerEscalatedAt = new Date(now.getTime() + settings.escalateToGroupAfterMin * 60_000)

  return { offeredToUserId: resolution.userId, offerEscalatedAt }
}

/**
  * The technician of an assignment (`specs/07-escalation.md` §7.14, ADR-0039,
  * decision 3): a user target names that technician; a pool or a group target
  * takes the head of the assignee pool — the list the office maintains. A
  * deactivated account is nobody, so a target without a technician changes
  * nothing.
  */
export async function resolveAssignee(
  database: Db,
  target: EscalationTarget,
): Promise<string | null> {
  if (target.kind === 'user') {
    const rows = await database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, target.id), eq(users.active, true)))

    return rows[0]?.id ?? null
  }

  return firstAssignee(await resolveAssigneePool(database))
}

/**
  * Hands the ticket to the technicians of the target: the step of the
  * transition table, the assignees of the assignment, one `escalation_note`
  * event with `{ rule, stage, target }` and one outbox row per technician over
  * the way the technician chose (ADR-0037).
  *
  * The `offer` hands the ticket to the on-call person of its target; the
  * `assign` hands it to **one** technician (§7.14, ADR-0039) and writes no
  * assignee row any more.
  */
export async function distributeTicket(
  database: Db,
  input: {
    ticketId: string
    target: EscalationTarget
    kind: DistributionKind
    ruleKey: string
    stageKey: string | null
    /** The payload of the workflow step (the offer names the on-call person). */
    payload?: Record<string, unknown>
  },
): Promise<DistributionResult> {
  if (input.kind === 'assign') {
    const technician = await resolveAssignee(database, input.target)

    if (technician === null) {
      return { changed: false, technicians: 0, notified: 0 }
    }

    return assignTicketByEscalation(database, {
      ticketId: input.ticketId,
      userId: technician,
      acceptance: true,
      ruleKey: input.ruleKey,
      stageKey: input.stageKey,
    })
  }

  const technicians = await resolveTargetTechnicians(database, input.target)

  if (technicians.length === 0) {
    return { changed: false, technicians: 0, notified: 0 }
  }

  const now = new Date()
  const offer = await offerPayload(database, input.target, now)

  try {
    await transitionTicket({
      database,
      ticketId: input.ticketId,
      event: 'offered',
      actorKind: 'system',
      payload: { rule: input.ruleKey, stage: input.stageKey, ...offer, ...(input.payload ?? {}) },
    })
  } catch (error) {
    // A ticket that is gone changes nothing; any other error is a failure.
    if (error instanceof TicketTransitionError) {
      return { changed: false, technicians: 0, notified: 0 }
    }

    throw error
  }

  await database.insert(ticketEvents).values({
    ticketId: input.ticketId,
    type: 'escalation_note',
    actorKind: 'system',
    payload: {
      rule: input.ruleKey,
      stage: input.stageKey,
      target: { kind: input.target.kind, id: input.target.id },
    },
  })

  const notified = await notifyTechnicians(database, {
    ticketId: input.ticketId,
    eventType: 'ticket.escalated',
    technicians,
    ruleKey: input.ruleKey,
    stageKey: input.stageKey,
  })

  return { changed: true, technicians: technicians.length, notified }
}

/**
 * The assignment of the escalation (`specs/07-escalation.md` §7.14, ADR-0039):
 * the ticket goes to one technician, the assignment waits for the technician
 * (`offered`) and the technician is notified. The rule of the escalation is
 * recorded in the history beside the step of the workflow.
 */
export async function assignTicketByEscalation(
  database: Db,
  input: {
    ticketId: string
    userId: string
    acceptance: boolean
    ruleKey: string
    stageKey: string | null
  },
): Promise<DistributionResult> {
  let result: AssignResult

  try {
    result = await assignTicket(database, {
      ticketId: input.ticketId,
      userId: input.userId,
      acceptance: input.acceptance,
      assignedBy: null,
    })
  } catch (error) {
    // A ticket that is gone changes nothing; any other error is a failure.
    if (error instanceof TicketTransitionError) {
      return { changed: false, technicians: 0, notified: 0 }
    }

    throw error
  }

  if (!result.changed) {
    return { changed: false, technicians: 0, notified: 0 }
  }

  await database.insert(ticketEvents).values({
    ticketId: input.ticketId,
    type: 'escalation_note',
    actorKind: 'system',
    payload: {
      rule: input.ruleKey,
      stage: input.stageKey,
      assignee: input.userId,
    },
  })

  const notified = await notifyTechnicians(database, {
    ticketId: input.ticketId,
    eventType: 'ticket.assigned',
    technicians: [input.userId],
    ruleKey: input.ruleKey,
    stageKey: input.stageKey,
  })

  return { changed: true, technicians: 1, notified }
}

/**
 * Queues the personal deliveries of a distribution to the technicians the event
 * reaches (ADR-0037). Shared by the escalation and the manual assignment.
 */
async function notifyTechnicians(
  database: Db,
  input: {
    ticketId: string
    eventType: 'ticket.escalated' | 'ticket.assigned'
    technicians: string[]
    ruleKey: string | null
    stageKey: string | null
  },
): Promise<number> {
  const recipients = await escalationRecipients(database, input.eventType, input.technicians)

  if (recipients.length === 0) {
    return 0
  }

  const ticketRows = await database
    .select({
      ticketNo: tickets.ticketNo,
      priority: tickets.priority,
      objectName: objects.name,
    })
    .from(tickets)
    .innerJoin(objects, eq(objects.id, tickets.objectId))
    .where(eq(tickets.id, input.ticketId))
    .limit(1)

  const ticket = ticketRows[0]

  if (ticket !== undefined) {
    // The personal deliveries of the distribution (WP-M14-120b): each
    // technician gets a message row next to the outbox row, so the inbox
    // shows the assignment and whether it arrived. The way is the one the
    // technician chose for the event (ADR-0037); only ntfy knows the
    // personal address of the recipient.
    await enqueuePersonalDeliveries(
      database,
      recipients.map((recipient) => ({
        userId: recipient.userId,
        channel: recipient.channel,
        eventType: input.eventType,
        title: ticket.ticketNo,
        body: [ticket.priority, ticket.objectName, input.ruleKey, input.stageKey]
          .filter((value) => value !== '' && value !== null && value !== undefined)
          .join(' · '),
        ticketId: input.ticketId,
        target: {
          ticketNo: ticket.ticketNo,
          priority: ticket.priority,
          objectName: ticket.objectName,
          escalationRule: input.ruleKey,
          escalationStage: input.stageKey,
          ...(recipient.topic === '' ? {} : { ntfyTopic: recipient.topic }),
        },
      })),
    )
  }

  return recipients.length
}

/**
 * The manual assignment of the office (`specs/07-escalation.md` §7.14, ADR-0033,
 * WP-M19-02): the office names a readiness pool, a user group or one technician
 * of the ticket in the ticket view. The ticket takes the `assigned` step, the
 * technicians of the target become assignees and receive the `ticket.assigned`
 * notification. A target without an active technician is refused — the ticket
 * stays as it is.
 */
export async function assignTicketByUser(
  database: Db,
  input: { ticketId: string; actorUserId: string; target: EscalationTarget },
): Promise<typeof tickets.$inferSelect> {
  const technicians = await resolveTargetTechnicians(database, input.target)

  if (technicians.length === 0) {
    throw new TicketTransitionError(422, 'assign_target_empty', {})
  }

  const { ticket } = await transitionTicket({
    database,
    ticketId: input.ticketId,
    event: 'assigned',
    actorUserId: input.actorUserId,
    payload: { target: { kind: input.target.kind, id: input.target.id } },
  })

  await database
    .insert(ticketAssignees)
    .values(technicians.map((userId) => ({ ticketId: input.ticketId, userId })))
    .onConflictDoNothing()

  await notifyTechnicians(database, {
    ticketId: input.ticketId,
    eventType: 'ticket.assigned',
    technicians,
    ruleKey: null,
    stageKey: null,
  })

  return ticket
}
