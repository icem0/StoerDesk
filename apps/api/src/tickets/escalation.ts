import { and, eq, inArray, like, notInArray } from 'drizzle-orm'

import {
  computeTicketTimeline,
  ESCALATION_RULES,
  ESCALATION_STAGE_TEXTS,
  escalationRulesFor,
  type EscalationRule,
  type EscalationRuleKey,
  type EscalationRuleOverride,
  type EscalationStageText,
} from '@stoerdesk/shared'

import type { Database } from '../db/client'
import { settings, ticketEvents, ticketPauses, tickets } from '../db/schema'
import { escalateOnCallOffers } from '../oncall/coupling'

/**
 * Escalation scan (`PLAN.md` §9, `specs/07-escalation.md` §7.1–§7.2, WP-M6-08).
 *
 * The scan looks at open tickets, resolves the six rules per priority (with the
 * `ticket.escalation.<rule>.minutes` overrides), subtracts overlapping pauses
 * from the reference interval and writes one append-only `escalated` event per
 * rule and threshold. The `(rule, thresholdAt)` pair makes a second scan a
 * no-op. No state changes, no notifications — WP-M6-09 schedules the scan.
 */

type Db = Database['database']
type TicketRow = typeof tickets.$inferSelect
type EventRow = typeof ticketEvents.$inferSelect
type PauseRow = typeof ticketPauses.$inferSelect

const RULE_STATUS: Partial<Record<EscalationRuleKey, string>> = {
  new_without_review: 'NEW',
  work_order_without_distribution: 'WORK_ORDER_CREATED',
  offered_without_claim: 'OFFERED',
  assigned_without_accept: 'ASSIGNED',
}

const REFERENCE_EVENT: Partial<Record<string, string>> = {
  work_order_set: 'work_order_set',
  offered: 'offered',
  assigned: 'assigned',
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
  rule: EscalationRuleKey
  level: string
  label: EscalationStageText['label']
  description: EscalationStageText['description']
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

function overrideValue(value: unknown, field: 'minutes' | 'critical_minutes'): number | undefined {
  const candidate =
    typeof value === 'number'
      ? value
      : value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)[field]
        : undefined

  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined
}

export async function readOverrides(
  database: Db,
): Promise<Partial<Record<EscalationRuleKey, EscalationRuleOverride>>> {
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, 'ticket.escalation.%'))

  const overrides: Partial<Record<EscalationRuleKey, EscalationRuleOverride>> = {}

  for (const row of rows) {
    const match = /^ticket\.escalation\.([a-z0-9_]+)\.(minutes|critical_minutes)$/.exec(row.key)

    if (match === null) {
      continue
    }

    const rule = match[1] as EscalationRuleKey
    const field = match[2] === 'critical_minutes' ? 'critical_minutes' : 'minutes'
    const value = overrideValue(row.value, field)

    if (value === undefined) {
      continue
    }

    const current = overrides[rule] ?? {}
    overrides[rule] = { ...current, [field === 'critical_minutes' ? 'criticalMinutes' : 'minutes']: value }
  }

  return overrides
}

/** Reads a stored `{ de, en }` stage text; a malformed row falls back to the default. */
function stageTextOf(value: unknown): { de: string; en: string } | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.de !== 'string' || typeof candidate.en !== 'string') {
    return undefined
  }

  return { de: candidate.de, en: candidate.en }
}

/**
 * The effective name and description of every escalation stage: the shipped
 * defaults of `ESCALATION_STAGE_TEXTS`, replaced by the installation's own
 * texts from `ticket.escalation.<rule>.label` and `.description`.
 */
export async function readStageTexts(
  database: Db,
): Promise<Record<EscalationRuleKey, EscalationStageText>> {
  const texts = {} as Record<EscalationRuleKey, EscalationStageText>

  for (const rule of ESCALATION_RULES) {
    const fallback = ESCALATION_STAGE_TEXTS[rule.key]

    texts[rule.key] = {
      label: { ...fallback.label },
      description: { ...fallback.description },
    }
  }

  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, 'ticket.escalation.%'))

  for (const row of rows) {
    const match = /^ticket\.escalation\.([a-z0-9_]+)\.(label|description)$/.exec(row.key)
    const ruleKey = match?.[1]
    const field = match?.[2]

    if (ruleKey === undefined || field === undefined || !Object.hasOwn(texts, ruleKey)) {
      continue
    }

    const rule = ruleKey as EscalationRuleKey
    const text = stageTextOf(row.value)

    if (text === undefined) {
      continue
    }

    texts[rule] =
      field === 'label'
        ? { ...texts[rule], label: text }
        : { ...texts[rule], description: text }
  }

  return texts
}

function hasEscalated(events: readonly EventRow[], rule: string, thresholdAt: string): boolean {
  return events.some((event) => {
    if (event.type !== 'escalated' || event.payload === null) {
      return false
    }

    const payload = event.payload as { rule?: unknown; thresholdAt?: unknown }

    return payload.rule === rule && payload.thresholdAt === thresholdAt
  })
}

function referenceTime(ticket: TicketRow, rule: EscalationRule, events: readonly EventRow[]) {
  if (rule.reference === 'received_at') {
    return toMs(ticket.receivedAt)
  }

  const eventType = rule.reference === null ? undefined : REFERENCE_EVENT[rule.reference]
  const matching = events
    .filter((event) => event.type === eventType)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return toMs(matching[0]?.createdAt)
}

function decisionFor(
  ticket: TicketRow,
  rule: EscalationRule,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  now: number,
): { thresholdAt: string } | null {
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

    return {
      thresholdAt: new Date(point + pauseMillis(pauses, reported, point)).toISOString(),
    }
  }

  if (RULE_STATUS[rule.key] !== ticket.status) {
    return null
  }

  const reference = referenceTime(ticket, rule, events)

  if (reference === undefined) {
    return null
  }

  const elapsed = now - reference - pauseMillis(pauses, reference, now)

  if (elapsed < rule.thresholdMs) {
    return null
  }

  const point = reference + rule.thresholdMs

  return {
    thresholdAt: new Date(point + pauseMillis(pauses, reference, point)).toISOString(),
  }
}

async function ticketContext(database: Db, where: ReturnType<typeof eq>) {
  const [ticket] = await database.select().from(tickets).where(where).limit(1)

  if (ticket === undefined) {
    throw new EscalationError(404, 'ticket_not_found')
  }

  const [events, pauses] = await Promise.all([
    database.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id)),
    database.select().from(ticketPauses).where(eq(ticketPauses.ticketId, ticket.id)),
  ])

  return { ticket, events, pauses }
}

async function evaluateOne(
  database: Db,
  ticket: TicketRow,
  events: readonly EventRow[],
  pauses: readonly PauseRow[],
  overrides: Partial<Record<EscalationRuleKey, EscalationRuleOverride>>,
  texts: Record<EscalationRuleKey, EscalationStageText>,
  now: number,
): Promise<EscalationFired[]> {
  const fired: EscalationFired[] = []

  for (const rule of escalationRulesFor(ticket.priority, overrides)) {
    const decision = decisionFor(ticket, rule, events, pauses, now)

    if (decision === null || hasEscalated(events, rule.key, decision.thresholdAt)) {
      continue
    }

    const text = texts[rule.key]

    const payload = {
      rule: rule.key,
      level: rule.level,
      label: text.label,
      description: text.description,
      thresholdAt: decision.thresholdAt,
      deadlineAt: ticket.deadlineAt.toISOString(),
    }

    await database.transaction(async (tx) => {
      await tx.insert(ticketEvents).values({
        ticketId: ticket.id,
        type: 'escalated',
        actorKind: 'system',
        payload,
      })
    })

    fired.push({
      rule: rule.key,
      level: rule.level,
      label: payload.label,
      description: payload.description,
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
  const offers = await escalateOnCallOffers(database, now)

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
  const [events, pauses, overrides, texts] = await Promise.all([
    database.select().from(ticketEvents).where(inArray(ticketEvents.ticketId, ids)),
    database.select().from(ticketPauses).where(inArray(ticketPauses.ticketId, ids)),
    readOverrides(database),
    readStageTexts(database),
  ])

  const nowMs = now.getTime()
  let fired = 0

  for (const ticket of candidates) {
    const ticketFired = await evaluateOne(
      database,
      ticket,
      events.filter((event) => event.ticketId === ticket.id),
      pauses.filter((pause) => pause.ticketId === ticket.id),
      overrides,
      texts,
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
  const { ticket, events, pauses } = await ticketContext(database, eq(tickets.id, ticketId))

  const [overrides, texts] = await Promise.all([
    readOverrides(database),
    readStageTexts(database),
  ])

  return await evaluateOne(database, ticket, events, pauses, overrides, texts, now.getTime())
}
