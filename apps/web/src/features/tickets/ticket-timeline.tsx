import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeTicketTimeline,
  type TimelinePause,
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

const PAUSABLE_STATUSES = new Set(['NEW', 'IN_REVIEW', 'WORK_ORDER_CREATED', 'OFFERED', 'ASSIGNED', 'ACCEPTED'])

type PauseRow = TimelinePause & { reason: string }

type TicketTimelineProps = {
  reportedAt: string
  deadlineAt: string
  stoppedAt: string | null
  pauses: readonly PauseRow[]
  markers: readonly { type: string; at: string }[]
  status: string
  onPause?: (reason: string) => Promise<void>
  onResume?: () => Promise<void>
}

function parseMs(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

export function TicketTimeline({
  reportedAt,
  deadlineAt,
  stoppedAt,
  pauses,
  markers,
  status,
  onPause,
  onResume,
}: TicketTimelineProps) {
  const { t } = useTranslation('ticket')
  const [pauseReason, setPauseReason] = useState('')

  const [timeline, setTimeline] = useState(() =>
    computeTicketTimeline({ reportedAt, deadlineAt, stoppedAt, pauses, now: new Date() }),
  )

  const recompute = useCallback(() => {
    setTimeline(
      computeTicketTimeline({ reportedAt, deadlineAt, stoppedAt, pauses, now: new Date() }),
    )
  }, [reportedAt, deadlineAt, stoppedAt, pauses])

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
  const span = reportedMs !== undefined && deadlineMs !== undefined ? deadlineMs - reportedMs : 0

  const openPause = pauses.find((pause) => pause.endedAt === null)
  const canPause = PAUSABLE_STATUSES.has(status)

  const remainingLabel =
    state === 'stopped'
      ? t('timeline.stopped')
      : remainingMs <= 0
        ? t('timeline.overdue', { hours: hoursOver })
        : t('timeline.remaining', { hours: hoursLeft })

  async function handlePause() {
    const reason = window.prompt(t('timeline.prompt.reason'))
    if (reason === null || reason.trim() === '') return
    setPauseReason(reason.trim())
    try {
      await onPause?.(reason.trim())
    } finally {
      setPauseReason('')
    }
  }

  return (
    <section className="col-span-full rounded bg-slate-900/50 border border-slate-700 p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {t('timeline.title')}
      </h2>

      <div className="relative h-3 w-full rounded bg-slate-800/50 overflow-hidden mb-2">
        <div
          className={`h-full transition-colors duration-300 ${colour}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
        {reportedMs !== undefined && deadlineMs !== undefined && span > 0 &&
          markers.map((marker) => {
            const atMs = parseMs(marker.at)
            const left =
              atMs !== undefined
                ? Math.min(100, Math.max(0, ((atMs - reportedMs) / span) * 100))
                : 0
            return (
              <div
                key={marker.at}
                className="absolute -top-1 h-5 w-1 bg-slate-400"
                style={{ left: `${left}%` }}
                title={`${marker.type} · ${marker.at}`}
              />
            )
          })}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
        <span className={`font-medium ${state === 'red' ? 'text-rose-400' : 'text-slate-300'}`}>
          {remainingLabel}
        </span>
      </div>

      {canPause && (
        <div className="flex gap-2">
          {openPause !== undefined ? (
            <button
              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-amber-500 disabled:opacity-50"
              type="button"
              onClick={() => void onResume?.()}
              disabled={pauseReason !== ''}
            >
              {t('timeline.resume')}
            </button>
          ) : (
            <button
              className="rounded bg-slate-600 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-500 disabled:opacity-50"
              type="button"
              onClick={handlePause}
              disabled={pauseReason !== ''}
            >
              {t('timeline.pause')}
            </button>
          )}
          {openPause !== undefined && (
            <span className="text-xs text-slate-500">
              {t('timeline.pauseReason', { reason: openPause.reason })}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
