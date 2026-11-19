import { useTranslation } from 'react-i18next'
import type { DashboardSnapshot } from '@stoerdesk/shared'

/**
 * The latest reports of the wall display (`specs/11-dashboard.md` §11.7).
 *
 * The list is ordered by `reported_at`, newest first, and sits on one side of
 * the wall screen next to the statistics. It carries no contact data and no
 * link: a wall display is a display only.
 */

type RecentTicketRow = DashboardSnapshot['recentTickets'][number]

function RecentTicket(props: { row: RecentTicketRow }) {
  const { t, i18n } = useTranslation('ticket')
  const { row } = props

  const reportedAt = new Date(row.reportedAt).toLocaleString(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const lastEventAt =
    row.lastEvent === null
      ? null
      : new Date(row.lastEvent.at).toLocaleString(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
  const lastEventLabel =
    row.lastEvent === null
      ? null
      : t(`status.events.${row.lastEvent.type}`, { defaultValue: row.lastEvent.type })

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-semibold">{row.objectName}</span>
          <span className="font-mono text-sm text-sky-300">{row.ticketNo}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>{t(`status.values.${row.status}`)}</span>
          <span>{t(`priority.${row.priority}`)}</span>
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {t('dashboard.recentTickets.reportedAt', { time: reportedAt })}
      </p>
      {lastEventLabel !== null && lastEventAt !== null ? (
        <p className="mt-1 text-xs text-slate-500">
          {t('dashboard.recentTickets.lastEvent', { label: lastEventLabel, time: lastEventAt })}
        </p>
      ) : null}
    </li>
  )
}

export function RecentTickets(props: { rows: DashboardSnapshot['recentTickets'] }) {
  const { t } = useTranslation('ticket')

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-400">
        {t('dashboard.recentTickets.title')}
      </h2>
      {props.rows.length === 0 ? (
        <p className="mt-2 text-xl text-slate-500">{t('dashboard.recentTickets.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-slate-800">
          {props.rows.map((row) => (
            <RecentTicket key={row.ticketNo} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}
