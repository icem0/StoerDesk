import type { EscalationTarget } from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { ticketAssignees, ticketEvents } from '../db/schema'
import { resolveGroupMemberIds, resolvePoolMemberIds } from '../oncall/members'
import { TicketTransitionError, transitionTicket } from '../tickets/workflow'

/**
 * The distribution of a ticket by the escalation (`specs/07-escalation.md`
 * §7.14, ADR-0026, WP-M14-82).
 *
 * The `offer` and the `assign` action of a fired rule hand the ticket to the
 * technicians of a target — a readiness pool or a user group. Both perform a
 * step of the transition table (`§7.13`, ADR-0025): the offer the `offered`
 * step, the assignment the `assigned` step. A ticket whose status has no such
 * step keeps its status and the action changes nothing — the rule of the
 * `status_change` action.
 *
 * The assignment records the technicians in `ticket_assignees`
 * (`specs/02-data-model.md` §4.13); the offer names the on-call person of a
 * pool in `offered_to_user_id` and sets the offer timeout (WP-M14-83). Every
 * distribution writes one append-only `escalation_note` event.
 */

type Db = Database['database']

/** The two distributions of §7.14. */
export type DistributionKind = 'offer' | 'assign'

export type DistributionResult = {
  /** False when the ticket has no step of the transition table for it. */
  changed: boolean
  /** The number of the technicians of the target. */
  technicians: number
}

/**
 * The technicians of a target: the members of a readiness pool or of a user
 * group (§7.14). An unknown target has no technician.
 */
export async function resolveTargetTechnicians(
  database: Db,
  target: EscalationTarget,
): Promise<string[]> {
  return target.kind === 'pool'
    ? resolvePoolMemberIds(database, target.id)
    : resolveGroupMemberIds(database, target.id)
}

/**
 * Hands the ticket to the technicians of the target: the step of the
 * transition table, the assignees of the assignment and one `escalation_note`
 * event with `{ rule, stage, target }`.
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
  const technicians = await resolveTargetTechnicians(database, input.target)

  if (technicians.length === 0) {
    return { changed: false, technicians: 0 }
  }

  const event = input.kind === 'offer' ? 'offered' : 'assigned'

  try {
    await transitionTicket({
      database,
      ticketId: input.ticketId,
      event,
      actorKind: 'system',
      payload: { rule: input.ruleKey, stage: input.stageKey, ...(input.payload ?? {}) },
    })
  } catch (error) {
    // Without an active step of the transition table the action changes
    // nothing (§7.13) — a ticket outside `WORK_ORDER_CREATED` stays as it is.
    if (error instanceof TicketTransitionError) {
      return { changed: false, technicians: 0 }
    }

    throw error
  }

  if (input.kind === 'assign') {
    await database
      .insert(ticketAssignees)
      .values(technicians.map((userId) => ({ ticketId: input.ticketId, userId })))
      .onConflictDoNothing()
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

  return { changed: true, technicians: technicians.length }
}
