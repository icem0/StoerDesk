import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TicketListResponse } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Start page of the internal app (`PLAN.md` §13, WP-M2-22).
 *
 * The index route `/` of the guarded shell. It carries the primary action
 * "Neue Störung melden" and the tiles the office needs at a glance: total,
 * open, overdue and not yet reviewed tickets, plus the "Brennt jetzt" list of
 * the open tickets with the nearest deadline. The full dashboard of phase 9
 * (live updates, wall display, on-call tile) arrives later.
 */

function useCount(query: string) {
  return useQuery({
    queryKey: ['dashboard', 'count', query],
    queryFn: () => apiFetch<TicketListResponse>(`/v1/tickets?${query}`),
    retry: false,
  })
}

function useBurningNow() {
  return useQuery({
    queryKey: ['dashboard', 'burning-now'],
    queryFn: () => apiFetch<TicketListResponse>('/v1/tickets?open=true&order=deadlineAt&direction=asc&limit=5'),
    retry: false,
  })
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Neu',
  IN_REVIEW: 'In Prüfung',
  WORK_ORDER_CREATED: 'Auftrag angelegt',
  OFFERED: 'Angeboten',
  ASSIGNED: 'Zugewiesen',
  ACCEPTED: 'Angenommen',
  ACKNOWLEDGED: 'Rückmeldung erfolgt',
  CLOSED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
}

export function StartPage() {
  const { t } = useTranslation('ticket')

  const total = useCount('limit=1')
  const open = useCount('open=true&limit=1')
  const overdue = useCount('overdue=true&limit=1')
  const unreviewed = useCount('status=NEW&limit=1')
  const burning = useBurningNow()

  const tiles = [
    {
      key: 'total',
      label: t('dashboard.tiles.total'),
      value: total.data?.total ?? 0,
      to: '/tickets',
      tone: 'text-slate-200',
    },
    {
      key: 'open',
      label: t('dashboard.tiles.open'),
      value: open.data?.total ?? 0,
      to: '/tickets?open=true',
      tone: 'text-sky-300',
    },
    {
      key: 'overdue',
      label: t('dashboard.tiles.overdue'),
      value: overdue.data?.total ?? 0,
      to: '/tickets?overdue=true',
      tone: 'text-rose-300',
    },
    {
      key: 'unreviewed',
      label: t('dashboard.tiles.unreviewed'),
      value: unreviewed.data?.total ?? 0,
      to: '/tickets?status=NEW',
      tone: 'text-amber-300',
    },
  ]

  const rows = burning.data?.tickets ?? []
  // The reference time is taken once per mount, so the remaining time of the
  // tiles is stable and the render stays pure.
  const [now] = useState(() => Date.now())

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <h1 className="text-lg font-semibold">{t('dashboard.greeting')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('dashboard.hint')}</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/tickets/create"
        >
          {t('dashboard.primaryAction')}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            to={tile.to}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </p>
            <p className={`mt-1 text-3xl font-semibold ${tile.tone}`}>{tile.value}</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          {t('dashboard.burningTitle')}
        </h2>

        {burning.isPending ? (
          <p className="mt-2 text-slate-400">{t('dashboard.loading')}</p>
        ) : burning.isError ? (
          <p className="mt-2 text-rose-400" role="alert">{t('dashboard.loadError')}</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-slate-400">{t('dashboard.noOpenTickets')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-800 rounded-xl border border-slate-700">
            {rows.map((ticket) => {
              const remaining = new Date(ticket.deadlineAt).getTime() - now
              const overdue = remaining < 0
              const hours = Math.round(Math.abs(remaining) / 3_600_000)

              return (
                <li key={ticket.ticketNo}>
                  <Link
                    className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-800/60"
                    to={`/tickets/${ticket.ticketNo}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-200">
                        {ticket.objectName}
                      </span>
                      <span className="block font-mono text-xs text-slate-500">
                        {ticket.ticketNo}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      <span
                        className={`text-xs font-medium ${overdue ? 'text-rose-300' : 'text-slate-400'}`}
                      >
                        {overdue
                          ? t('dashboard.remaining.overdue', { hours })
                          : t('dashboard.remaining.hours', { hours })}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
