import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'
import { OpenTickets } from './open-tickets'

/**
 * Wall display at `/tv/:token` (`specs/11-dashboard.md` §11.7, WP-M9-16).
 *
 * A full-screen page outside the guarded shell and the logged-in navigation. It
 * polls `GET /api/v1/tv/:token` every 15 seconds because a wall display has no
 * session cookie (SSE needs one). The page never renders contact data, the phone
 * number or channel detail. A wrong or rotated token answers `404 tv_not_found`;
 * the page shows no data and stops polling.
 *
 * The wall display shows the same blocks as the start page (WP-M10-31): the
 * statistics and the list of the open tickets. The readiness has its own page
 * (`/oncall`), so nothing about the on-call shift is left here.
 */

function useTv(token: string | undefined) {
  return useQuery({
    queryKey: ['tv', token],
    queryFn: () => apiFetch<DashboardSnapshot>(`/v1/tv/${token}`),
    enabled: token !== undefined && token !== '',
    retry: false,
    refetchInterval: (query) => (query.state.error === null ? 15_000 : false),
  })
}

export function TvPage() {
  const { t } = useTranslation('ticket')
  const { token } = useParams<{ token: string }>()
  const query = useTv(token)
  const snapshot = query.data

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404

    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="text-center text-xl font-semibold text-rose-300" role="alert">
          {notFound ? t('dashboard.tv.notFound') : t('dashboard.loadError')}
        </p>
      </main>
    )
  }

  if (snapshot === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-slate-400">
        <p className="text-xl">{t('dashboard.loading')}</p>
      </main>
    )
  }

  const { faultFree, tiles, burningNow } = snapshot

  const tileValues = [
    { key: 'open', value: tiles.open, tone: 'text-sky-300' },
    { key: 'overdue', value: tiles.overdue, tone: 'text-rose-300' },
    { key: 'unreviewed', value: tiles.unreviewed, tone: 'text-amber-300' },
    { key: 'pool', value: tiles.poolSize, tone: 'text-purple-300' },
  ] as const

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-slate-950 p-6 text-slate-100">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {t('dashboard.faultFree.title')}
        </p>
        {faultFree.since === null ? (
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {t('dashboard.faultFree.none')}
          </p>
        ) : (
          <>
            <p className="mt-2 text-5xl font-bold text-emerald-300">
              {t('dashboard.faultFree.days', { count: faultFree.days })}
            </p>
            <p className="mt-1 text-lg text-slate-400">
              {t('dashboard.faultFree.record', { count: faultFree.recordDays })}
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tileValues.map((tile) => (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6" key={tile.key}>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {t(`dashboard.tiles.${tile.key}`)}
            </p>
            <p className={`mt-1 text-6xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <OpenTickets generatedAt={snapshot.generatedAt} rows={burningNow} />
    </main>
  )
}
