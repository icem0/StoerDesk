import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * Wall display at `/tv/:token` (`specs/11-dashboard.md` §11.7, WP-M9-16).
 *
 * A full-screen page outside the guarded shell and the logged-in navigation. It
 * polls `GET /api/v1/tv/:token` every 15 seconds because a wall display has no
 * session cookie (SSE needs one). The page never renders contact data, the phone
 * number or channel detail. A wrong or rotated token answers `404 tv_not_found`;
 * the page shows no data and stops polling.
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

function hoursUntil(instant: string, now: number): number {
  return Math.ceil((new Date(instant).getTime() - now) / 3_600_000)
}

export function TvPage() {
  const { t, i18n } = useTranslation('ticket')
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
  const now = new Date(snapshot.generatedAt).getTime()
  const onCall = tiles.onCall
  const onCallUnstaffed = onCall !== null && (onCall.kind === 'unstaffed' || onCall.warning === 'oncall_unstaffed')
  const format = (instant: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(instant),
    )

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

      {onCallUnstaffed ? (
        <p className="rounded-2xl bg-rose-900/60 px-6 py-4 text-center text-2xl font-bold text-rose-100">
          {t('dashboard.tv.onCallUnstaffed')}
        </p>
      ) : null}

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

      {onCall !== null ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {t('dashboard.onCall.title')}
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {onCall.kind === 'unstaffed'
              ? t('dashboard.onCall.unstaffed')
              : (onCall.name ?? t(`dashboard.onCall.${onCall.kind}`))}
          </p>
          {onCall.endsAt !== null ? (
            <p className="mt-1 text-xl text-slate-400">
              {t('dashboard.onCall.endsAt', { time: format(onCall.endsAt) })}
            </p>
          ) : null}
          {onCall.warning === 'oncall_unconfirmed' ? (
            <p className="mt-2 text-lg font-semibold text-amber-300">
              {t('dashboard.onCall.warning.oncall_unconfirmed')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
        <h1 className="text-lg font-semibold uppercase tracking-wide text-slate-400">
          {t('dashboard.tv.burningNow')}
        </h1>
        {burningNow.length === 0 ? (
          <p className="mt-2 text-xl text-slate-500">{t('dashboard.tv.empty')}</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-slate-800">
            {burningNow.map((ticket) => {
              const hours = hoursUntil(ticket.deadlineAt, now)
              const overdue = hours < 0

              return (
                <li className="flex flex-wrap items-baseline justify-between gap-2 py-3" key={ticket.ticketNo}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xl font-semibold">{ticket.objectName}</span>
                    <span className="font-mono text-sm text-sky-300">{ticket.ticketNo}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">
                      {t(`status.values.${ticket.status}`)} · {t(`priority.${ticket.priority}`)}
                    </span>
                    <span
                      className={`text-xl font-bold tabular-nums ${
                        overdue ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {overdue
                        ? t('dashboard.tv.overdue', { hours: Math.abs(hours) })
                        : t('dashboard.tv.remaining', { hours })}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
