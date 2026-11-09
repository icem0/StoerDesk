import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TicketListResponse } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Start page of the internal app (`PLAN.md` §13, WP-M2-22, WP-M9-19).
 *
 * The index route `/` of the guarded shell. It carries the primary action
 * "Neue Störung melden" and the tiles the office needs at a glance: total,
 * open, overdue and not yet reviewed tickets. Every tile is one link over its
 * whole area. The full dashboard of phase 9 (fault-free counter, live updates,
 * wall display, on-call tile) arrives with WP-M9-14.
 */

function useCount(query: string) {
  return useQuery({
    queryKey: ['dashboard', 'count', query],
    queryFn: () => apiFetch<TicketListResponse>(`/v1/tickets?${query}`),
    retry: false,
  })
}

export function StartPage() {
  const { t } = useTranslation('ticket')

  const total = useCount('limit=1')
  const open = useCount('open=true&limit=1')
  const overdue = useCount('overdue=true&limit=1')
  const unreviewed = useCount('status=NEW&limit=1')

  const counts = [total, open, overdue, unreviewed]

  const tiles = [
    {
      key: 'total',
      label: t('dashboard.tiles.total'),
      query: total,
      to: '/tickets',
      tone: 'text-slate-200',
    },
    {
      key: 'open',
      label: t('dashboard.tiles.open'),
      query: open,
      to: '/tickets?open=true',
      tone: 'text-sky-300',
    },
    {
      key: 'overdue',
      label: t('dashboard.tiles.overdue'),
      query: overdue,
      to: '/tickets?overdue=true',
      tone: 'text-rose-300',
    },
    {
      key: 'unreviewed',
      label: t('dashboard.tiles.unreviewed'),
      query: unreviewed,
      to: '/tickets?status=NEW',
      tone: 'text-amber-300',
    },
  ]

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
            className="block rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            to={tile.to}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </p>
            <p className={`mt-1 text-3xl font-semibold ${tile.tone}`}>
              {tile.query.isPending ? '…' : (tile.query.data?.total ?? 0)}
            </p>
          </Link>
        ))}
      </div>

      {counts.every((count) => count.isPending) ? (
        <p className="text-sm text-slate-400">{t('dashboard.loading')}</p>
      ) : null}

      {counts.some((count) => count.isError) ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('dashboard.loadError')}
        </p>
      ) : null}
    </section>
  )
}
