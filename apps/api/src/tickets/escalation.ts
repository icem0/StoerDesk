import { and, eq, inArray, notInArray } from 'drizzle-orm'

import {
  computeTicketTimeline,
  ESCALATION_REFERENCE_EVENTS,
  escalationRuleConfigSchema,
  escalationTimerLeaves,
  evaluateEscalationCondition,
  externalTypeCategory,
  type EscalationCondition,
  type EscalationFacts,
  type EscalationRuleConfig,
  type EscalationTimerValue,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { dispatchEscalationActions } from '../escalation/actions'
import { escalateOnCallOffers, resolveStaffedPoolIds } from '../oncall/coupling'
import {
  escalationFirings,
  escalationRules,
  escalationStages,
  objects,
  ticketEvents,
  ticketPauses,
  tickets,
} from '../db/schema'

/**
 * Escalation scan (`specs/07-escalation.md` §7.2, §7.3, §7.7, ADR-0017,
 * WP-M13-06).
 *
 * The scan reads the rules of the database and computes the threshold of every
 * rule from the `timer_expired` leaves of its condition (ADR-0064): a timer
 * with a start value waits its minutes of the priority of the ticket, the
 * percent variant waits for its share of the timeline, the overlapping pauses
 * are subtracted. A stage rule without a timer is due from the start of its wait
 * (§7.11). The condition of a rule — its timers included — decides whether it
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
type StageRow = Pick<
  typeof escalationStages.$inferSelect,
  'key' | 'predecessor' | 'reachedBy'
>

/** Reads the active stage chain of the installation (ADR-0023). */
export async function readEscalationStageChain(database: Db): Promise<StageRow[]> {
  return await database
    .select({
      key: escalationStages.key,
      predecessor: escalationStages.predecessor,
      reachedBy: escalationStages.reachedBy,
    })
    .from(escalationStages)
    .where(eq(escalationStages.active, true))
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
      condition: row.condition,
      actions: [],
      active: row.active,
    })),
  )
}

/** The moment of a start value of a timer: `received_at` or the latest event of its type. */
function startValueTime(
  ticket: TicketRow,
  reference: string,
  events: readonly EventRow[],
): number | undefined {
  if (reference === 'received_at') {
    return toMs(ticket.receivedAt)
  }

  return latestEventTime(events, [reference])
}

/**
 * The minutes elapsed from every start value that has happened to now, pauses
 * excluded (ADR-0064 decision 6) — the fact `sinceEvent` of a timer leaf.
 */
function sinceEventFor(
  ticket: TicketRow,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  now: number,
): Record<string, number> {
  const since: Record<string, number> = {}

  for (const reference of ESCALATION_REFERENCE_EVENTS) {
    const start = startValueTime(ticket, reference, events)

    if (start !== undefined) {
      since[reference] = Math.max(0, now - start - pauseMillis(pauses, start, now)) / 60000
    }
  }

  return since
}

/**
 * The threshold of one `expired` timer: the start value plus the delay of the
 * priority (the percent variant: its share of the timeline), plus the pauses
 * inside. `null` while the timer runs or its start value never happened.
 */
function timerThreshold(
  ticket: TicketRow,
  value: EscalationTimerValue,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  now: number,
): number | null {
  if ('percent' in value) {
    const timeline = computeTicketTimeline({
      reportedAt: ticket.reportedAt,
      deadlineAt: ticket.deadlineAt,
      now: new Date(now),
      pauses,
    })

    if (timeline.percent < value.percent) {
      return null
    }

    const reported = ticket.reportedAt.getTime()
    const deadline = ticket.deadlineAt.getTime()
    const point = reported + ((deadline - reported) * value.percent) / 100

    return point + pauseMillis(pauses, reported, point)
  }

  const start = startValueTime(ticket, value.reference, events)

  if (start === undefined) {
    return null
  }

  const minutes =
    (value.minutes as Record<string, number>)[ticket.priority] ?? value.minutes.normal
  const delay = minutes * 60 * 1000

  if (now - start - pauseMillis(pauses, start, now) < delay) {
    return null
  }

  const point = start + delay

  return point + pauseMillis(pauses, start, point)
}

/**
 * The condition without its timers: the rule of the first stage is due with the
 * ticket itself, independent of its timer (§7.2, §7.11) — the rest of its
 * condition still decides.
 */
function withoutTimers(condition: EscalationCondition): EscalationCondition {
  if ('all' in condition) {
    return { all: condition.all.map(withoutTimers) }
  }

  if ('any' in condition) {
    return { any: condition.any.map(withoutTimers) }
  }

  return condition.field === 'timer_expired' ? { all: [] } : condition
}

function latestEventTime(
  events: readonly EventRow[],
  types: readonly string[],
): number | undefined {
  let latest: number | undefined

  for (const event of events) {
    if (!types.includes(event.type)) {
      continue
    }

    const at = toMs(event.createdAt)

    if (at !== undefined && (latest === undefined || at > latest)) {
      latest = at
    }
  }

  return latest
}

/** The stages the ticket has reached, read from its events and the chain. */
function reachedStages(events: readonly EventRow[], stages: readonly StageRow[]): string[] {
  return stages
    .filter((stage) => stage.reachedBy.some((type) => events.some((event) => event.type === type)))
    .map((stage) => stage.key)
}

/**
 * The clock start of a stage (§7.11): `received_at` without a predecessor,
 * otherwise the latest event that reached the predecessor. A predecessor that
 * the workflow never reached hands its own clock down.
 */
function stageReferenceTime(
  ticket: TicketRow,
  events: readonly EventRow[],
  stages: readonly StageRow[],
  stageKey: string,
): number | undefined {
  const stage = stages.find((entry) => entry.key === stageKey)

  if (stage === undefined) {
    return undefined
  }

  if (stage.predecessor === null) {
    return toMs(ticket.receivedAt)
  }

  const predecessor = stages.find((entry) => entry.key === stage.predecessor)

  if (predecessor === undefined) {
    return undefined
  }

  if (predecessor.reachedBy.length === 0) {
    return stageReferenceTime(ticket, events, stages, predecessor.key)
  }

  return latestEventTime(events, predecessor.reachedBy)
}

/**
 * Computes the threshold of a rule (§7.7, ADR-0064 decision 4 and 5): the
 * largest threshold of the `expired` timers of its condition — every one of
 * them must have expired — or, for a stage rule without a timer, the start of
 * its wait. `null` means the rule is not due. `condition` is the condition the
 * rule is evaluated with.
 */
function decisionFor(
  ticket: TicketRow,
  rule: EscalationRuleConfig,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  stages: readonly StageRow[],
  now: number,
): { thresholdAt: Date; condition: EscalationCondition } | null {
  let stage: StageRow | undefined

  if (rule.stageKey !== null) {
    stage = stages.find((entry) => entry.key === rule.stageKey)

    if (stage === undefined) {
      return null
    }

    if (stage.reachedBy.some((type) => events.some((event) => event.type === type))) {
      return null
    }

    // The first stage of the chain opens with the ticket itself: its rules are
    // due at creation, independent of their timer. The rest of the condition
    // still decides whether such a rule fires (WP-M14-91, §7.11).
    if (stage.predecessor === null) {
      if (pauses.some((pause) => pause.endedAt === null)) {
        return null
      }

      const received = toMs(ticket.receivedAt)

      return received === undefined
        ? null
        : { thresholdAt: new Date(received), condition: withoutTimers(rule.condition) }
    }
  }

  const timers = escalationTimerLeaves(rule.condition).filter(
    (timer) => timer.operator === 'expired',
  )

  if (timers.length === 0) {
    // A deadline rule without a timer has no wait; a stage rule without a timer
    // waits with zero delay from the start of its wait (ADR-0064 decision 4).
    if (stage === undefined) {
      return null
    }

    const start = stageReferenceTime(ticket, events, stages, stage.key)

    return start === undefined
      ? null
      : { thresholdAt: new Date(start), condition: rule.condition }
  }

  let threshold = -Infinity

  for (const timer of timers) {
    const point = timerThreshold(ticket, timer.value, events, pauses, now)

    if (point === null) {
      return null
    }

    threshold = Math.max(threshold, point)
  }

  return { thresholdAt: new Date(threshold), condition: rule.condition }
}

/** The facts of a ticket that the conditions of the rules are evaluated against. */
function factsFor(
  ticket: TicketRow,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  stages: readonly StageRow[],
  externalType: string | null,
  now: number,
  staffedPools: readonly string[],
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
    stageReached: reachedStages(events, stages),
    staffedPools,
    sinceEvent: sinceEventFor(ticket, events, pauses, now),
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
  stages: readonly StageRow[],
  externalType: string | null,
  now: number,
  staffedPools: readonly string[],
): Promise<EscalationFired[]> {
  const fired: EscalationFired[] = []
  const facts = factsFor(ticket, events, pauses, stages, externalType, now, staffedPools)

  for (const rule of rules) {
    const decision = decisionFor(ticket, rule, events, pauses, stages, now)

    if (decision === null) {
      continue
    }

    if (!evaluateEscalationCondition(decision.condition, facts)) {
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

    const [event] = await database
      .insert(ticketEvents)
      .values({
        ticketId: ticket.id,
        type: 'escalated',
        actorKind: 'system',
        payload,
      })
      .returning({ id: ticketEvents.id })

    if (event !== undefined) {
      await dispatchEscalationActions(
        database,
        {
          ticketId: ticket.id,
          ruleKey: rule.key,
          stageKey: rule.stageKey,
          eventId: event.id,
        },
        facts,
        new Date(now),
      )
    }

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
  const [rules, stages] = await Promise.all([
    readEscalationRules(database),
    readEscalationStageChain(database),
  ])

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
  // The readiness of the scan (§7.4, ADR-0030): the pools with a staffed shift
  // at this moment. One query for the whole scan, not one per ticket.
  const staffedPools = await resolveStaffedPoolIds(database, now)
  let fired = 0

  for (const ticket of candidates) {
    const ticketFired = await evaluateOne(
      database,
      ticket,
      events.filter((event) => event.ticketId === ticket.id),
      pauses.filter((pause) => pause.ticketId === ticket.id),
      rules,
      stages,
      externalTypeByObject.get(ticket.objectId) ?? null,
      nowMs,
      staffedPools,
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

  const [rules, stages] = await Promise.all([
    readEscalationRules(database),
    readEscalationStageChain(database),
  ])

  const staffedPools = await resolveStaffedPoolIds(database, now)

  return await evaluateOne(
    database,
    ticket,
    events,
    pauses,
    rules,
    stages,
    objectRows[0]?.externalType ?? null,
    now.getTime(),
    staffedPools,
  )
}
