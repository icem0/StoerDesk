import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeTicketTimeline,
  type TimelineState,
} from '@stoerdesk/shared'

/** How often the client recomputes the timeline so a wrong device clock never
 *  becomes authoritative (PLAN.md §9). */
const REFRESH_MS = 60 * 1000

const STATE_COLOUR: Record<TimelineState, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-rose-500',
  stopped: 'bg-slate-500',
}

type TicketTimelineProps = {
  reportedAt: string
  deadlineAt: string
  stoppedAt: string | null
  markers: readonly { type: string; at: string }[]
  /** Deadline length in hours, shown next to the deadline label ("72 Std / 72 h"). */
  deadlineHours: number
  /** Suffix appended to scale numbers ("Std" / "h"). */
  scaleSuffix: string
}

function parseMs(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

/** Scale tick positions every 6 hours between reportedAt and deadlineAt. */
function scaleTicks(reportedMs: number, deadlineMs: number): number[] {
  const ticks: number[] = []
  const stepMs = 6 * 60 * 60 * 1000
  let t = reportedMs
  while (t <= deadlineMs) {
    ticks.push(t)
    t += stepMs
  }
  return ticks
}

export function TicketTimeline({
  reportedAt,
  deadlineAt,
  stoppedAt,
  markers,
  deadlineHours,
  scaleSuffix,
}: TicketTimelineProps) {
  const { t } = useTranslation('ticket')

  const [timeline, setTimeline] = useState(() =>
    computeTicketTimeline({ reportedAt, deadlineAt, stoppedAt, pauses: [], now: new Date() }),
  )

  const recompute = useCallback(() => {
    setTimeline(
      computeTicketTimeline({ reportedAt, deadlineAt, stoppedAt, pauses: [], now: new Date() }),
    )
  }, [reportedAt, deadlineAt, stoppedAt])

  useEffect(() => {
    const immediate = setTimeout(recompute, 0)
    const timer = setInterval(recompute, REFRESH_MS)
    return () => {
      clearTimeout(immediate)
      clearInterval(timer)
    }
  }, [recompute])

  const { state, percent, remainingMs } = timeline
  const colour = STATE_COLOUR[state]
  const hoursLeft = Math.max(0, Math.ceil(remainingMs / 3_600_000))
  const hoursOver = Math.max(0, Math.ceil((timeline.elapsedMs - timeline.totalMs) / 3_600_000))

  const reportedMs = parseMs(reportedAt)
  const deadlineMs = parseMs(deadlineAt)
  const span =
    reportedMs !== undefined && deadlineMs !== undefined ? deadlineMs - reportedMs : 0

  const ticks = useMemo(
    () => (reportedMs !== undefined && deadlineMs !== undefined ? scaleTicks(reportedMs, deadlineMs) : []),
    [reportedMs, deadlineMs],
  )

  const remainingLabel =
    state === 'stopped'
      ? t('timeline.stopped')
      : remainingMs <= 0
        ? t('timeline.overdue', { hours: hoursOver })
        : t('timeline.remaining', { hours: hoursLeft })

  const reportedTime = reportedMs !== undefined ? new Date(reportedMs).toLocaleString() : ''
  const deadlineTime = deadlineMs !== undefined ? new Date(deadlineMs).toLocaleString() : ''

  return (
    <section className="col-span-full rounded bg-slate-900/50 border border-slate-700 p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {t('timeline.title')}
      </h2>

      <div className="flex items-baseline gap-2 text-xs text-slate-400 mb-1">
        <span className="font-medium">{t('timeline.reportedAtLabel')}</span>
        <span>{reportedTime}</span>
      </div>
      <div className="flex items-baseline gap-2 text-xs text-slate-400 justify-end mb-2">
        <span className="font-medium">{t('timeline.deadlineLabel')}</span>
        <span>{deadlineTime} ({deadlineHours} {scaleSuffix})</span>
      </div>

      <div className="relative h-3 w-full rounded bg-slate-800/50 overflow-hidden mb-1">
        <div
          className={`h-full transition-colors duration-300 ${colour}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
        {reportedMs !== undefined && deadlineMs !== undefined && span > 0 && (
          <>
            {markers.map((marker) => {
              const atMs = parseMs(marker.at)
              const left =
                atMs !== undefined
                  ? Math.min(100, Math.max(0, ((atMs - reportedMs) / span) * 100))
                  : 0
              return (
                <div
                  key={marker.at}
                  className="absolute -top-1.5 z-10 h-3 w-3 rounded-full bg-slate-300 border border-slate-700 shadow-sm"
                  style={{ left: `${left}%` }}
                  title={`${marker.type} · ${marker.at}`}
                />
              )
            })}
            <div
              className="absolute -top-1 z-10 h-3 w-[1px] bg-rose-400/70"
              style={{ left: '100%' }}
              title={t('timeline.deadline')}
            />
          </>
        )}
      </div>

      {reportedMs !== undefined && deadlineMs !== undefined && span > 0 && (
        <div className="relative h-4 w-full mb-3">
          {ticks.map((tickMs, index) => {
            const left = ((tickMs - reportedMs) / span) * 100
            const hours = Math.round((tickMs - reportedMs) / 3_600_000)
            return (
              <div
                key={index}
                className="absolute flex flex-col items-center"
                style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-[1px] h-2 bg-slate-600" />
                <span className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                  {hours} {scaleSuffix}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
        <span className={`font-medium ${state === 'red' ? 'text-rose-400' : 'text-slate-300'}`}>
          {remainingLabel}
        </span>
      </div>
    </section>
  )
}
