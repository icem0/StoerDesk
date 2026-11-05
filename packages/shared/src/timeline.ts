/**
 * Deadline and timeline of a ticket (`PLAN.md` §9, `specs/05-timeline.md`,
 * ADR-0008).
 *
 * The module is pure: the API computes the timeline for its answer and the web
 * app recomputes it every minute from the same input, so a wrong device clock
 * never becomes authoritative. Times cross the boundary as ISO strings.
 */

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const

export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

/**
 * Deadline length per priority (ADR-0008). The `settings` rows
 * `ticket.deadline_hours.<priority>` may override these values at runtime.
 */
export const DEADLINE_HOURS: Record<TicketPriority, number> = {
  low: 168,
  normal: 72,
  high: 24,
  critical: 8,
}

/** Colour boundaries of the timeline bar in percent. */
export const TIMELINE_THRESHOLDS = { yellow: 50, orange: 80 } as const

export type TimelineState = 'green' | 'yellow' | 'orange' | 'red' | 'stopped'

export type TimelinePause = {
  startedAt: string | Date
  endedAt?: string | Date | null
}

export type TicketTimelineInput = {
  reportedAt: string | Date
  deadlineAt: string | Date
  stoppedAt?: string | Date | null
  now?: string | Date
  pauses?: readonly TimelinePause[]
}

export type TicketTimeline = {
  reportedAt: string
  deadlineAt: string
  stoppedAt: string | null
  pausedMs: number
  totalMs: number
  elapsedMs: number
  remainingMs: number
  percent: number
  state: TimelineState
}

export type DeadlineHoursOverrides = Partial<Record<TicketPriority, number>>

const isPriority = (value: string): value is TicketPriority =>
  (TICKET_PRIORITIES as readonly string[]).includes(value)

function toMillis(value: string | Date | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  const millis = value instanceof Date ? value.getTime() : Date.parse(value)

  return Number.isFinite(millis) ? millis : undefined
}

/** Deadline of a trusted base timestamp; an unknown priority behaves as `normal`. */
export function deadlineAtFor(
  base: Date,
  priority: string,
  overrides: DeadlineHoursOverrides = {},
): Date {
  const key = isPriority(priority) ? priority : 'normal'
  const override = overrides[key]
  const hours =
    override !== undefined && Number.isFinite(override) && override > 0
      ? override
      : DEADLINE_HOURS[key]

  return new Date(base.getTime() + hours * 60 * 60 * 1000)
}

function pausedMillis(
  pauses: readonly TimelinePause[],
  intervalStart: number,
  intervalEnd: number,
): number {
  let total = 0

  for (const pause of pauses) {
    const start = Math.max(toMillis(pause.startedAt) ?? intervalStart, intervalStart)
    const rawEnd = toMillis(pause.endedAt) ?? intervalEnd
    const end = Math.min(rawEnd, intervalEnd)

    if (end > start) {
      total += end - start
    }
  }

  return total
}

/**
 * Computes the timeline of `specs/05-timeline.md` §5.3. A stopped timeline wins
 * over every colour and reports `stopped`; an open pause runs up to `now`.
 */
export function computeTicketTimeline(input: TicketTimelineInput): TicketTimeline {
  const reported = toMillis(input.reportedAt) ?? 0
  const deadline = toMillis(input.deadlineAt) ?? reported
  const stopped = toMillis(input.stoppedAt)
  const now = toMillis(input.now) ?? Date.now()
  const end = stopped ?? now

  const totalMs = Math.max(0, deadline - reported)
  const rawPaused = pausedMillis(input.pauses ?? [], reported, Math.max(reported, end))
  const pausedMs = Math.min(rawPaused, totalMs)
  const elapsedMs = Math.max(0, end - reported - pausedMs)
  const remainingMs = Math.max(0, totalMs - elapsedMs)
  const percent =
    totalMs === 0 ? 100 : Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))

  let state: TimelineState

  if (stopped !== undefined) {
    state = 'stopped'
  } else if (remainingMs === 0 || percent >= 100) {
    state = 'red'
  } else if (percent >= TIMELINE_THRESHOLDS.orange) {
    state = 'orange'
  } else if (percent >= TIMELINE_THRESHOLDS.yellow) {
    state = 'yellow'
  } else {
    state = 'green'
  }

  return {
    reportedAt: new Date(reported).toISOString(),
    deadlineAt: new Date(deadline).toISOString(),
    stoppedAt: stopped === undefined ? null : new Date(stopped).toISOString(),
    pausedMs,
    totalMs,
    elapsedMs,
    remainingMs,
    percent: Math.round(percent * 100) / 100,
    state,
  }
}
