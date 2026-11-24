import { and, eq } from 'drizzle-orm'

import type { TicketAssignmentStatus } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { tickets, users } from '../db/schema'
import { nextAssignee, resolveAssigneePool } from '../escalation/assignee-pool'
import { notifyAssignee, notifyAssigner } from '../notifications/assignment'
import { TicketTransitionError, transitionTicket } from './workflow'

/**
 * The assignment of a ticket (`specs/07-escalation.md` §7.14, ADR-0039,
 * WP-M19-04).
 *
 * A ticket is handled by **one** person. The assignment names that technician
 * in `tickets.assigned_user_id` and carries the state of the assignment in
 * `tickets.assignment_status` (`offered`, `accepted`, `declined`) beside the
 * user who made it in `tickets.assigned_by_user_id` — the _Sachbearbeiter_ the
 * acceptance notice reaches.
 *
 * The technician answers the assignment: `accepted` or `declined`. A refusal
 * passes the ticket to the **next member of the assignee pool** with the
 * status `offered` (decision 4 of ADR-0039); without a next member the ticket
 * keeps the status `declined` and the rule of the escalation decides what
 * happens next.
 *
 * Every change writes one `ticket_events` row of the step it performs, so the
 * history of the assignments stays in the event log.
 */

type Db = Database['database']

export type AssignmentAnswer = 'accepted' | 'declined'

export type AssignResult = {
  /** False when the ticket could not be assigned (the ticket is gone). */
  changed: boolean
  ticket: typeof tickets.$inferSelect
  /** The technician of the ticket after the change. */
  assignedUserId: string | null
  /** The status of the assignment after the change. */
  assignmentStatus: TicketAssignmentStatus | null
  /** The user who made the assignment; null for a rule-made assignment. */
  assignedByUserId: string | null
}

export type AssignTicketInput = {
  ticketId: string
  /** The technician the ticket is assigned to. */
  userId: string
  /** `true` — the technician has to answer; `false` — the assignment is accepted at once. */
  acceptance: boolean
  /** The user who made the assignment; null when a rule of the system made it. */
  assignedBy?: string | null
  /** The rule of the escalation that made the assignment — the notice names it. */
  rule?: { ruleKey: string | null; stageKey: string | null } | null
}

export type AnswerAssignmentInput = {
  ticketId: string
  /** The technician who answers — only the assigned technician may answer. */
  actorUserId: string
  answer: AssignmentAnswer
}

/**
 * The technician of an assignment must be an **active** user: a deactivated
 * account is nobody, so a ticket is never handed to it.
 */
async function assertActiveUser(database: Db, userId: string): Promise<void> {
  const [row] = await database
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (row === undefined) {
    throw new TicketTransitionError(422, 'assign_user_unknown', { userId })
  }

  if (!row.active) {
    throw new TicketTransitionError(422, 'assign_user_inactive', { userId })
  }
}

/**
 * Assigns the ticket to one technician (`specs/07-escalation.md` §7.14): the
 * step `assigned` of the workflow, the status of the assignment and the user
 * who made it. With `acceptance` the status is `offered` and waits for the
 * technician, without it the assignment is `accepted` at once.
 */
export async function assignTicket(
  database: Db,
  input: AssignTicketInput,
  env?: Env,
): Promise<AssignResult> {
  await assertActiveUser(database, input.userId)

  const assignedBy = input.assignedBy ?? null
  const assignmentStatus: TicketAssignmentStatus = input.acceptance ? 'offered' : 'accepted'

  const { ticket } = await transitionTicket({
    database,
    ticketId: input.ticketId,
    event: 'assigned',
    actorKind: assignedBy === null ? 'system' : 'user',
    ...(assignedBy === null ? {} : { actorUserId: assignedBy }),
    payload: {
      assignedUserId: input.userId,
      assignmentStatus,
      assignedByUserId: assignedBy,
    },
  })

  // The technician is notified (§7.14, decision 5 of ADR-0039): the way is the
  // one he chose for `ticket.assigned` (§11.4, ADR-0037).
  await notifyAssignee(
    database,
    {
      ticketId: input.ticketId,
      userId: input.userId,
      ruleKey: input.rule?.ruleKey ?? null,
      stageKey: input.rule?.stageKey ?? null,
    },
    env,
  )

  return {
    changed: true,
    ticket,
    assignedUserId: ticket.assignedUserId,
    assignmentStatus: ticket.assignmentStatus as TicketAssignmentStatus | null,
    assignedByUserId: ticket.assignedByUserId,
  }
}
export async function answerAssignment(
  database: Db,
  input: AnswerAssignmentInput,
  env?: Env,
): Promise<AssignResult> {
  const [row] = await database
    .select({
      id: tickets.id,
      assignedUserId: tickets.assignedUserId,
      assignmentStatus: tickets.assignmentStatus,
      assignedByUserId: tickets.assignedByUserId,
    })
    .from(tickets)
    .where(eq(tickets.id, input.ticketId))
    .limit(1)

  const current = row

  if (current === undefined) {
    throw new TicketTransitionError(404, 'ticket_not_found', { ticketId: input.ticketId })
  }

  if (current.assignedUserId === null || current.assignedUserId !== input.actorUserId) {
    throw new TicketTransitionError(403, 'not_assignee', { ticketId: input.ticketId })
  }

  if (current.assignmentStatus !== 'offered') {
    throw new TicketTransitionError(409, 'assignment_not_offered', {
      ticketId: input.ticketId,
    })
  }

  const { ticket } = await transitionTicket({
    database,
    ticketId: input.ticketId,
    event: input.answer === 'accepted' ? 'accepted' : 'declined',
    actorUserId: input.actorUserId,
    payload: {
      assignedUserId: current.assignedUserId,
      assignmentStatus: input.answer,
    },
  })

  if (input.answer === 'declined') {
    // The refusal chain (§7.14, decision 4 of ADR-0039): the ticket passes to
    // the next member of the assignee pool. Without a next member the ticket
    // keeps the status `declined`.
    const successor = await continueAssignmentChain(database, {
      ticketId: input.ticketId,
      currentUserId: input.actorUserId,
      assignedBy: current.assignedByUserId,
    })

    if (successor !== null) {
      // The assigner is notified about the refusal before the ticket passes to
      // the next member of the pool.
      await notifyAssignerOfAnswer(
        database,
        {
          ticketId: input.ticketId,
          assignedBy: current.assignedByUserId,
          answer: input.answer,
          assigneeUserId: input.actorUserId,
        },
        env,
      )

      return successor
    }
  }

  await notifyAssignerOfAnswer(
    database,
    {
      ticketId: input.ticketId,
      assignedBy: current.assignedByUserId,
      answer: input.answer,
      assigneeUserId: input.actorUserId,
    },
    env,
  )

  return {
    changed: true,
    ticket,
    assignedUserId: ticket.assignedUserId,
    assignmentStatus: ticket.assignmentStatus as TicketAssignmentStatus | null,
    assignedByUserId: ticket.assignedByUserId,
  }
}

/**
 * The notice of the answer (§7.14, decision 5 of ADR-0039): the user who made
 * the assignment is notified. A rule-made assignment has no assigner and
 * notifies nobody.
 */
async function notifyAssignerOfAnswer(
  database: Db,
  input: {
    ticketId: string
    assignedBy: string | null
    answer: 'accepted' | 'declined'
    assigneeUserId: string
  },
  env?: Env,
): Promise<void> {
  if (input.assignedBy === null) {
    return
  }

  const [assignee] = await database
    .select({ givenName: users.givenName, familyName: users.familyName })
    .from(users)
    .where(eq(users.id, input.assigneeUserId))
    .limit(1)

  const name = `${assignee?.givenName ?? ''} ${assignee?.familyName ?? ''}`.trim()

  await notifyAssigner(
    database,
    {
      ticketId: input.ticketId,
      userId: input.assignedBy,
      answer: input.answer,
      assigneeName: name,
    },
    env,
  )
}

/**
 * The refusal chain (`specs/07-escalation.md` §7.14, decision 4 of ADR-0039):
 * a refusal passes the ticket to the next member of the assignee pool with the
 * status `offered`. A technician that is not a member of the pool has no
 * successor and a pool without a further member leaves the ticket at
 * `declined`.
 */
export async function continueAssignmentChain(
  database: Db,
  input: { ticketId: string; currentUserId: string; assignedBy?: string | null },
): Promise<AssignResult | null> {
  const pool = await resolveAssigneePool(database)
  const successor = nextAssignee(pool, input.currentUserId)

  if (successor === null) {
    return null
  }

  return assignTicket(database, {
    ticketId: input.ticketId,
    userId: successor,
    acceptance: true,
    assignedBy: input.assignedBy ?? null,
  })
}

/**
 * The assignment of a ticket that nobody answers any more — the read of the
 * current state for the answers of the API.
 */
export async function readAssignment(
  database: Db,
  ticketId: string,
): Promise<{
  assignedUserId: string | null
  assignmentStatus: TicketAssignmentStatus | null
  assignedByUserId: string | null
}> {
  const [row] = await database
    .select({
      assignedUserId: tickets.assignedUserId,
      assignmentStatus: tickets.assignmentStatus,
      assignedByUserId: tickets.assignedByUserId,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  return {
    assignedUserId: row?.assignedUserId ?? null,
    assignmentStatus: (row?.assignmentStatus as TicketAssignmentStatus | null) ?? null,
    assignedByUserId: row?.assignedByUserId ?? null,
  }
}

/**
 * The users of the installation that may be assigned — the active accounts.
 * The picker of the ticket view offers the pool of the office and, with an
 * empty pool, every active user (`specs/07-escalation.md` §7.14).
 */
export async function readAssignableUsers(
  database: Db,
): Promise<{ id: string; name: string }[]> {
  const rows = await database
    .select({
      id: users.id,
      givenName: users.givenName,
      familyName: users.familyName,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.active, true)))

  return rows.map((row) => {
    const name = `${row.givenName ?? ''} ${row.familyName ?? ''}`.trim()

    return { id: row.id, name: name === '' ? row.email : name }
  })
}
