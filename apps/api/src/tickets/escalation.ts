import { and, eq, inArray, like, notInArray } from 'drizzle-orm'

import {
  computeTicketTimeline,
  ESCALATION_STAGE_KEYS,
  escalationRuleConfigSchema,
  evaluateEscalationCondition,
  externalTypeCategory,
  type EscalationFacts,
  type EscalationReferenceEvent,
  type EscalationRuleConfig,
  type EscalationStageKey,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { escalateOnCallOffers } from '../oncall/coupling'
import {
  escalationFirings,
  escalationRules,
  objects,
  settings,
  ticketEvents,
  ticketPauses,
  tickets,
} from '../db/schema'

/**
 * Escalation scan (`specs/07-escalation.md` §7.2, §7.3, §7.7, ADR-0017,
 * WP-M13-06).
 *
 * The scan reads the rules of the database, computes the threshold of every
 * rule from its reference event and its minutes per priority (the deadline
 * rules from the percentage of the timeline), subtracts the overlapping pauses
 * and fires the rules that are due. The condition of a rule decides whether it
 * fires at all.
 *
 * A rule fires exactly once per ticket, rule and threshold: the unique key of
 * `escalation_firings` carries that guarantee in the database, so a second
 * scan of the same minute writes no second event.
 */

type Db = Database['database']
type TicketRow = typeof tickets.$inferSelect
type EventRow = typeof ticketEvents.$inferSelect
type PauseRow = typeof ticketPauses.$inferSelect

/**
 * The state a ticket waits in while it waits for the milestone of a rule. The
 * rule fires only in that state: a ticket that reached the milestone waits for
 * the next one.
 */
const WAITING_STATUS_BY_REFERENCE: Record<EscalationReferenceEvent, string> = {
  received_at: 'NEW',
  review_started: 'IN_REVIEW',
  work_order_set: 'WORK_ORDER_CREATED',
  offered: 'OFFERED',
  assigned: 'ASSIGNED',
  accepted: 'ACCEPTED',
}

/** The events that reach a stage of the workflow. */
const STAGE_EVENTS: Record<EscalationStageKey, readonly string[]> = {
  review: ['review_started'],
  work_order: ['work_order_set'],
  assignment: ['assigned', 'offered', 'claimed'],
  acceptance: ['accepted'],
  acknowledgement: ['acknowledged'],
}

export class EscalationError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string) {
    super(code)
    this.name = 'EscalationError'
    this.statusCode = statusCode
    this.code = code
  }
}

export type EscalationFired = {
  rule: string
  stage: string | null
  thresholdAt: string
  deadlineAt: string
}

export type EscalationScanResult = {
  scanned: number
  fired: number
  skipped: number
  offerScanned: number
  offerEscalated: number
}

function toMs(value: Date | string | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  const millis = value instanceof Date ? value.getTime() : Date.parse(value)

  return Number.isFinite(millis) ? millis : undefined
}

function pauseMillis(pauses: readonly PauseRow[], from: number, to: number): number {
  let total = 0

  for (const pause of pauses) {
    const start = Math.max(toMs(pause.startedAt) ?? from, from)
    const end = Math.min(toMs(pause.endedAt) ?? to, to)

    if (end > start) {
      total += end - start
    }
  }

  return total
}

/**
 * Reads the former settings rows of the escalation minutes. They are the
 * source of the seed (WP-M13-04) and of the deadline route until WP-M13-13
 * removes them.
 */
export async function readOverrides(
  database: Db,
): Promise<Partial<Record<string, { minutes?: number; criticalMinutes?: number }>>> {
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, 'ticket.escalation.%'))

  const overrides: Partial<Record<string, { minutes?: number; criticalMinutes?: number }>> = {}

  for (const row of rows) {
    const match = /^ticket\.escalation\.([a-z0-9_]+)\.(minutes|critical_minutes)$/.exec(row.key)

    if (match === null) {
      continue
    }

    const rule = match[1]
    const field = match[2]

    if (rule === undefined || field === undefined) {
      continue
    }

    const raw =
      typeof row.value === 'number'
        ? row.value
        : typeof row.value === 'object' && row.value !== null
          ? (row.value as Record<string, unknown>)[field]
          : undefined
    const value =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0
        ? raw
        : undefined

    if (value === undefined) {
      continue
    }

    const current = overrides[rule] ?? {}

    overrides[rule] = {
      ...current,
      [field === 'minutes' ? 'minutes' : 'criticalMinutes']: value,
    }
  }

  return overrides
}

/** Reads the active rules of the installation. */
export async function readEscalationRules(database: Db): Promise<EscalationRuleConfig[]> {
  const rows = await database
    .select()
    .from(escalationRules)
    .where(eq(escalationRules.active, true))

  return escalationRuleConfigSchema.array().parse(
    rows.map((row) => ({
      key: row.key,
      stageKey: row.stageKey,
      reference: row.reference,
      minutes: row.minutes,
      percent: row.percent,
      condition: row.condition,
      actions: [],
      active: row.active,
    })),
  )
}

function referenceTime(
  ticket: TicketRow,
  rule: EscalationRuleConfig,
  events: readonly EventRow[],
): number | undefined {
  if (rule.reference === 'received_at') {
    return toMs(ticket.receivedAt)
  }

  const matching = events
    .filter((event) => event.type === rule.reference)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return toMs(matching[0]?.createdAt)
}

/** The stages the ticket has reached, read from its events. */
function reachedStages(events: readonly EventRow[]): string[] {
  const reached = new Set<string>()

  for (const event of events) {
    for (const stage of ESCALATION_STAGE_KEYS) {
      if (STAGE_EVENTS[stage].includes(event.type)) {
        reached.add(stage)
      }
    }
  }

  return [...reached]
}

/**
 * Computes the threshold of a rule: the moment the ticket waited longer than
 * the deadline of the rule. `null` means the rule is not due.
 */
function decisionFor(
  ticket: TicketRow,
  rule: EscalationRuleConfig,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  now: number,
): { thresholdAt: Date } | null {
  if (rule.percent !== null) {
    const timeline = computeTicketTimeline({
      reportedAt: ticket.reportedAt,
      deadlineAt: ticket.deadlineAt,
      now: new Date(now),
      pauses,
    })

    if (timeline.percent < rule.percent) {
      return null
    }

    const reported = ticket.reportedAt.getTime()
    const deadline = ticket.deadlineAt.getTime()
    const point = reported + ((deadline - reported) * rule.percent) / 100

    return { thresholdAt: new Date(point + pauseMillis(pauses, reported, point)) }
  }

  if (rule.reference === null || rule.minutes === null) {
    return null
  }

  const waitingStatus = WAITING_STATUS_BY_REFERENCE[rule.reference]

  if (ticket.status !== waitingStatus) {
    return null
  }

  const reference = referenceTime(ticket, rule, events)

  if (reference === undefined) {
    return null
  }

  const priority = ticket.priority as keyof typeof rule.minutes
  const minutes = rule.minutes[priority] ?? rule.minutes.normal
  const elapsed = now - reference - pauseMillis(pauses, reference, now)

  if (elapsed < minutes * 60 * 1000) {
    return null
  }

  const point = reference + minutes * 60 * 1000

  return { thresholdAt: new Date(point + pauseMillis(pauses, reference, point)) }
}

/** The facts of a ticket that the conditions of the rules are evaluated against. */
function factsFor(
  ticket: TicketRow,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  externalType: string | null,
  now: number,
): EscalationFacts {
  const timeline = computeTicketTimeline({
    reportedAt: ticket.reportedAt,
    deadlineAt: ticket.deadlineAt,
    now: new Date(now),
    pauses,
  })

  const reported = ticket.reportedAt.getTime()

  return {
    priority: ticket.priority,
    status: ticket.status,
    source: ticket.source,
    systemType: externalTypeCategory(externalType),
    objectExternalType: externalType,
    assigned: ticket.assignedUserId !== null,
    deadlinePercent: timeline.percent,
    elapsedMinutes: Math.max(0, Math.round((now - reported) / 60000)),
    paused: pauses.some((pause) => pause.endedAt === null),
    stageReached: reachedStages(events),
  }
}

/**
 * Fires the rules of one ticket. The firing row is the lock: the unique key
 * over the ticket, the rule and the threshold lets exactly one scan write the
 * event.
 */
async function evaluateOne(
  database: Db,
  ticket: TicketRow,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  rules: readonly EscalationRuleConfig[],
  externalType: string | null,
  now: number,
): Promise<EscalationFired[]> {
  const fired: EscalationFired[] = []
  const facts = factsFor(ticket, events, pauses, externalType, now)

  for (const rule of rules) {
    const decision = decisionFor(ticket, rule, events, pauses, now)

    if (decision === null) {
      continue
    }

    if (!evaluateEscalationCondition(rule.condition, facts)) {
      continue
    }

    const inserted = await database
      .insert(escalationFirings)
      .values({
        ticketId: ticket.id,
        ruleKey: rule.key,
        stageKey: rule.stageKey,
        thresholdAt: decision.thresholdAt,
      })
      .onConflictDoNothing()
      .returning({ id: escalationFirings.id })

    if (inserted.length === 0) {
      continue
    }

    const payload = {
      rule: rule.key,
      stage: rule.stageKey,
      thresholdAt: decision.thresholdAt.toISOString(),
      deadlineAt: ticket.deadlineAt.toISOString(),
    }

    await database.insert(ticketEvents).values({
      ticketId: ticket.id,
      type: 'escalated',
      actorKind: 'system',
      payload,
    })

    fired.push({
      rule: rule.key,
      stage: rule.stageKey,
      thresholdAt: payload.thresholdAt,
      deadlineAt: payload.deadlineAt,
    })
  }

  return fired
}

/** Scans all open tickets once; the job of WP-M6-09 calls this every minute. */
export async function evaluateEscalations(
  database: Db,
  now: Date = new Date(),
): Promise<EscalationScanResult> {
  // The on-call offer timeout (`specs/04-oncall.md` §4a.6) is a part of the
  // scan: it hands a ticket that nobody took back to the group.
  const offers = await escalateOnCallOffers(database, now)
  const rules = await readEscalationRules(database)

  if (rules.length === 0) {
    return {
      scanned: 0,
      fired: 0,
      skipped: 0,
      offerScanned: offers.scanned,
      offerEscalated: offers.escalated,
    }
  }

  const candidates = await database
    .select()
    .from(tickets)
    .where(
      and(
        notInArray(tickets.status, ['ACKNOWLEDGED', 'CLOSED', 'CANCELLED']),
        eq(tickets.suspectedSpam, false),
      ),
    )

  if (candidates.length === 0) {
    return {
      scanned: 0,
      fired: 0,
      skipped: 0,
      offerScanned: offers.scanned,
      offerEscalated: offers.escalated,
    }
  }

  const ids = candidates.map((ticket) => ticket.id)
  const objectIds = [...new Set(candidates.map((ticket) => ticket.objectId))]
  const [events, pauses, objectRows] = await Promise.all([
    database.select().from(ticketEvents).where(inArray(ticketEvents.ticketId, ids)),
    database.select().from(ticketPauses).where(inArray(ticketPauses.ticketId, ids)),
    database
      .select({ id: objects.id, externalType: objects.externalType })
      .from(objects)
      .where(inArray(objects.id, objectIds)),
  ])

  const externalTypeByObject = new Map(objectRows.map((row) => [row.id, row.externalType]))
  const nowMs = now.getTime()
  let fired = 0

  for (const ticket of candidates) {
    const ticketFired = await evaluateOne(
      database,
      ticket,
      events.filter((event) => event.ticketId === ticket.id),
      pauses.filter((pause) => pause.ticketId === ticket.id),
      rules,
      externalTypeByObject.get(ticket.objectId) ?? null,
      nowMs,
    )

    fired += ticketFired.length
  }

  return {
    scanned: candidates.length,
    fired,
    skipped: candidates.length - fired,
    offerScanned: offers.scanned,
    offerEscalated: offers.escalated,
  }
}

/** Evaluates one ticket; useful for a targeted scan and the exit-criterion test. */
export async function evaluateTicketEscalations(
  database: Db,
  ticketId: string,
  now: Date = new Date(),
): Promise<EscalationFired[]> {
  const [ticket] = await database.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)

  if (ticket === undefined) {
    throw new EscalationError(404, 'ticket_not_found')
  }

  const [events, pauses, objectRows] = await Promise.all([
    database.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id)),
    database.select().from(ticketPauses).where(eq(ticketPauses.ticketId, ticket.id)),
    database
      .select({ externalType: objects.externalType })
      .from(objects)
      .where(eq(objects.id, ticket.objectId))
      .limit(1),
  ])

  const rules = await readEscalationRules(database)

  return await evaluateOne(
    database,
    ticket,
    events,
    pauses,
    rules,
    objectRows[0]?.externalType ?? null,
    now.getTime(),
  )
}
