import { and, asc, eq } from 'drizzle-orm'

import type { EscalationTarget, TicketAssignmentStatus } from '@stoerdesk/shared'

import type { Env } from '../config/env'
import type { Database } from '../db/client'
import { groups, oncallPools, tickets, users } from '../db/schema'
import { resolveGroupMemberIds, resolvePoolMemberIds } from '../oncall/members'
import { notifyAssignee, notifyAssigner } from '../notifications/assignment'
import { TicketTransitionError, transitionTicket } from './workflow'

/**
 * The assignment of a ticket (`specs/07-escalation.md` §7.14, ADR-0039,
 * ADR-0057, WP-M32-02).
 *
 * A ticket is handled by **one** person. The assignment names that technician
 * in `tickets.assigned_user_id` and carries the state of the assignment in
 * `tickets.assignment_status` (`offered`, `accepted`, `declined`) beside the
 * user who made it in `tickets.assigned_by_user_id` — the _Sachbearbeiter_ the
 * acceptance notice reaches.
 *
 * The assignment names a **target of the installation** (ADR-0057): a
 * readiness pool, a user group or one technician. The members of that target
 * are the list of the assignment — the first member gets the ticket, and a
 * refusal passes the ticket to the **next member of the same target**.
 *
 * The technician answers the assignment: `accepted` or `declined`. A refusal
 * passes the ticket to the next member of the target with the status
 * `offered`; without a next member the ticket keeps the status `declined` and
 * the rule of the escalation decides what happens next.
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
  /**
   * The target of the assignment (§7.14, ADR-0057): a readiness pool, a user
   * group or one technician. The first member of the target gets the ticket.
   */
  target: EscalationTarget
  /**
   * The member of the target that gets the ticket — the successor of a
   * refusal. Without it the first member of the target gets it.
   */
  memberUserId?: string
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
 * The members of the target of an assignment (`specs/07-escalation.md` §7.14,
 * ADR-0057): the members of a readiness pool or of a user group, ordered by
 * name (`specs/04-oncall.md` §4a.5); a target of the kind `user` is that
 * technician, if the account is active. An unknown pool, an unknown group and
 * a deactivated account have no member — a target without a member changes
 * nothing.
 */
export async function resolveTargetMembers(
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

  if (target.kind === 'group') {
    return resolveGroupMemberIds(database, target.id)
  }

  return resolvePoolMemberIds(database, target.id)
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
 * step `assigned` of the workflow, the status of the assignment, the user
 * who made it and the target of the assignment. With a target the first
 * member of that target gets the ticket (§7.14, ADR-0057); with `acceptance`
 * the status is `offered` and waits for the technician, without it the
 * assignment is `accepted` at once.
 */
export async function assignTicket(
  database: Db,
  input: AssignTicketInput,
  env?: Env,
): Promise<AssignResult> {
  const { target } = input
  const members = await resolveTargetMembers(database, target)
  const userId = input.memberUserId ?? members[0] ?? null

  if (userId === null) {
    // A target without a member is nobody — the assignment changes nothing
    // (§7.14, ADR-0057).
    throw new TicketTransitionError(422, 'assign_target_empty', { kind: target.kind })
  }

  await assertActiveUser(database, userId)

  const assignedBy = input.assignedBy ?? null
  const assignmentStatus: TicketAssignmentStatus = input.acceptance ? 'offered' : 'accepted'

  const { ticket } = await transitionTicket({
    database,
    ticketId: input.ticketId,
    event: 'assigned',
    actorKind: assignedBy === null ? 'system' : 'user',
    ...(assignedBy === null ? {} : { actorUserId: assignedBy }),
    payload: {
      assignedUserId: userId,
      assignmentStatus,
      assignedByUserId: assignedBy,
      // The target is the list the refusal walks (§7.14, ADR-0057).
      assignmentTargetKind: target.kind,
      assignmentTargetId: target.id,
    },
  })

  // The technician is notified (§7.14, decision 5 of ADR-0039): the way is the
  // one he chose for `ticket.assigned` (§11.4, ADR-0037).
  await notifyAssignee(
    database,
    {
      ticketId: input.ticketId,
      userId,
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
      assignmentTargetKind: tickets.assignmentTargetKind,
      assignmentTargetId: tickets.assignmentTargetId,
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
    // The refusal chain (§7.14, ADR-0057): the ticket passes to the next
    // member of the target of the assignment. Without a next member the ticket
    // keeps the status `declined`.
    const successor = await continueAssignmentChain(database, {
      ticketId: input.ticketId,
      currentUserId: input.actorUserId,
      assignedBy: current.assignedByUserId,
      target: assignmentTargetOf(current),
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
 * The member after the one who refused (§7.14, ADR-0057): the next member of
 * the list of the target. A technician that is not a member of the list has
 * no successor.
 */
function nextAssignee(members: readonly string[], currentUserId: string): string | null {
  const index = members.indexOf(currentUserId)

  if (index < 0) {
    return null
  }

  return members.slice(index + 1).find((id) => id !== currentUserId) ?? null
}

/**
 * The target of the assignment of a ticket (§7.14, ADR-0057): the two columns
 * of the ticket, if they carry a target. An assignment of the former shape has
 * no target — such a ticket has no successor in the chain.
 */
function assignmentTargetOf(row: {
  assignmentTargetKind: string | null
  assignmentTargetId: string | null
}): EscalationTarget | null {
  const kind = row.assignmentTargetKind
  const id = row.assignmentTargetId

  if (id === null) {
    return null
  }

  if (kind === 'pool' || kind === 'group' || kind === 'user') {
    return { kind, id }
  }

  return null
}

/**
 * The refusal chain (`specs/07-escalation.md` §7.14, ADR-0057): a refusal
 * passes the ticket to the next member of the target of the assignment with
 * the status `offered`. A technician that is not a member of the target has no
 * successor, and a target without a further member leaves the ticket at
 * `declined`.
 */
export async function continueAssignmentChain(
  database: Db,
  input: {
    ticketId: string
    currentUserId: string
    assignedBy?: string | null
    /**
     * The target of the assignment — the list the refusal walks. A ticket
     * without a target (an assignment of the former shape) has no successor.
     */
    target: EscalationTarget | null
  },
): Promise<AssignResult | null> {
  if (input.target === null) {
    return null
  }

  const members = await resolveTargetMembers(database, input.target)
  const successor = nextAssignee(members, input.currentUserId)

  if (successor === null) {
    return null
  }

  return assignTicket(database, {
    ticketId: input.ticketId,
    target: input.target,
    memberUserId: successor,
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
 * The picker of the ticket view offers the targets of the installation (§7.14,
 * ADR-0057) and, for a single technician, every active user.
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

/**
 * The target must name a row of the installation (§7.14, ADR-0057): a
 * readiness pool, a user group or a technician.
 */
export async function targetExists(database: Db, target: EscalationTarget): Promise<boolean> {
  if (target.kind === 'user') {
    const rows = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, target.id))
      .limit(1)

    return rows.length > 0
  }

  if (target.kind === 'group') {
    const rows = await database
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, target.id))
      .limit(1)

    return rows.length > 0
  }

  const rows = await database
    .select({ id: oncallPools.id })
    .from(oncallPools)
    .where(eq(oncallPools.id, target.id))
    .limit(1)

  return rows.length > 0
}

/** One target of the assignment with its members (§7.14, ADR-0057). */
export type AssignTarget = {
  id: string
  name: string
  members: { id: string; name: string }[]
}

/**
 * The targets of the assignment (`specs/07-escalation.md` §7.14, ADR-0057):
 * the readiness pools and the user groups of the installation with their
 * members, and the technicians of the installation. The picker of the ticket
 * view offers them; the first member of a pool or of a group gets the ticket.
 */
export async function readAssignTargets(database: Db): Promise<{
  pools: AssignTarget[]
  groups: AssignTarget[]
  users: { id: string; name: string }[]
}> {
  const people = await readAssignableUsers(database)
  const nameById = new Map(people.map((person) => [person.id, person.name]))

  const membersOf = (ids: string[]) =>
    ids.map((id) => ({ id, name: nameById.get(id) ?? '' })).filter((member) => member.name !== '')

  const poolRows = await database
    .select({ id: oncallPools.id, name: oncallPools.name })
    .from(oncallPools)
    .orderBy(asc(oncallPools.name))

  const groupRows = await database
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .orderBy(asc(groups.name))

  const pools: AssignTarget[] = []

  for (const pool of poolRows) {
    pools.push({ ...pool, members: membersOf(await resolvePoolMemberIds(database, pool.id)) })
  }

  const groupTargets: AssignTarget[] = []

  for (const group of groupRows) {
    groupTargets.push({ ...group, members: membersOf(await resolveGroupMemberIds(database, group.id)) })
  }

  return { pools, groups: groupTargets, users: people }
}
