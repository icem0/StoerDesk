import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { DashboardSnapshot } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'
import { DashboardDisplay } from './display'

/**
 * Wall display at `/tv/:token` (`specs/11-dashboard.md` §11.7, WP-M9-16).
 *
 * A full-screen page outside the guarded shell and the logged-in navigation. It
 * polls `GET /api/v1/tv/:token` every 15 seconds because a wall display has no
 * session cookie (SSE needs one). The page never renders contact data, the phone
 * number or channel detail. A wrong or rotated token answers `404 tv_not_found`;
 * the page shows no data and stops polling.
 *
 * The wall monitor shows the dashboard itself (WP-M10-36): it renders the same
 * `DashboardDisplay` the start page renders, with `interactive: false` — no
 * link is active and the primary action is not offered, because a wall monitor
 * is a display only.
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

  return (
    <main className="flex min-h-dvh flex-col bg-slate-950 p-6 text-slate-100">
      <DashboardDisplay interactive={false} snapshot={snapshot} />
    </main>
  )
}
