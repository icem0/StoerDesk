import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { DashboardSnapshot, TimelineState } from '@stoerdesk/shared'

/**
 * The open tickets of the dashboard (`specs/11-dashboard.md` §11.5, WP-M10-31).
 *
 * One list for the start page and the wall display: the object, the ticket
 * number, the status, the priority, the mini timeline of
 * `specs/05-timeline.md` §5.3 and the last entry of the history of the
 * ticket. The rows carry the values the snapshot computed — the web never
 * counts on its own.
 */

/** Mini timeline colours of the list bar (`specs/05-timeline.md` §5.3). */
const STATE_COLOUR: Record<TimelineState, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-rose-500',
  stopped: 'bg-slate-500',
}

type OpenTicketRow = DashboardSnapshot['burningNow'][number]

function OpenTicket(props: { row: OpenTicketRow; now: number; linkRows: boolean }) {
  const { t, i18n } = useTranslation('ticket')
  const { row } = props

  const deadlineMs = new Date(row.deadlineAt).getTime()
  const hours = Math.ceil((deadlineMs - props.now) / 3_600_000)
  const overdue = hours < 0
  const remainingLabel =
    row.timelineState === 'stopped'
      ? t('list.remaining.stopped')
      : overdue
        ? t('dashboard.openTickets.overdue', { hours: Math.abs(hours) })
        : t('dashboard.openTickets.remaining', { hours })

  const timeFormat: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  const lastEventAt =
    row.lastEvent === null
      ? null
      : new Date(row.lastEvent.at).toLocaleString(i18n.language, timeFormat)
  const lastEventLabel =
    row.lastEvent === null
      ? null
      : t(`status.events.${row.lastEvent.type}`, { defaultValue: row.lastEvent.type })

  const ticketNo = props.linkRows ? (
    <Link
      className="font-mono text-sm text-sky-300 hover:text-sky-200 hover:underline"
      to={`/tickets/${row.ticketNo}`}
    >
      {row.ticketNo}
    </Link>
  ) : (
    <span className="font-mono text-sm text-sky-300">{row.ticketNo}</span>
  )

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-semibold">{row.objectName}</span>
          {ticketNo}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>{t(`status.values.${row.status}`)}</span>
          <span>{t(`priority.${row.priority}`)}</span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="relative h-1.5 min-w-16 flex-1 overflow-hidden rounded bg-slate-700">
          <span
            className={`block h-full rounded ${STATE_COLOUR[row.timelineState]}`}
            style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
          />
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{remainingLabel}</span>
      </div>

      {lastEventLabel !== null && lastEventAt !== null ? (
        <p className="mt-1 text-xs text-slate-500">
          {t('dashboard.openTickets.lastEvent', { label: lastEventLabel, time: lastEventAt })}
        </p>
      ) : null}
    </li>
  )
}

export function OpenTickets(props: {
  rows: DashboardSnapshot['burningNow']
  /** The instant of the snapshot — the reference of the remaining time. */
  generatedAt: string
  /** The start page links every row to the ticket; the wall display has no session. */
  linkRows?: boolean
}) {
  const { t } = useTranslation('ticket')
  const now = new Date(props.generatedAt).getTime()
  const linkRows = props.linkRows ?? false

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-400">
        {t('dashboard.openTickets.title')}
      </h2>
      {props.rows.length === 0 ? (
        <p className="mt-2 text-xl text-slate-500">{t('dashboard.openTickets.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-slate-800">
          {props.rows.map((row) => (
            <OpenTicket key={row.ticketNo} linkRows={linkRows} now={now} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}
