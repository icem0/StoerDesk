import { useTranslation } from 'react-i18next'

import { useDashboard } from './use-dashboard'
import { DashboardDisplay } from './display'

/**
 * Start page of the internal app (`specs/11-dashboard.md` §11.2–§11.6, WP-M9-14).
 *
 * The index route `/` of the guarded shell. The page renders the one display of
 * the dashboard (`display.tsx`) with active links: the statistics first — the
 * fault-free counter, the four tiles and the evaluations of the averages — then
 * the list of the open tickets with the mini timeline and the last entry of the
 * history (WP-M10-32). The readiness has its own page (`/oncall`). The wall
 * monitor renders the same display without links (WP-M10-36) — both surfaces
 * always show the same thing.
 */

export function StartPage() {
  const { t } = useTranslation('ticket')
  const dashboard = useDashboard()
  const snapshot = dashboard.data

  if (dashboard.isError) {
    return (
      <p role="alert" className="text-sm text-rose-400">
        {t('dashboard.loadError')}
      </p>
    )
  }

  if (snapshot === undefined) {
    return <p className="text-sm text-slate-400">{t('dashboard.loading')}</p>
  }

  return <DashboardDisplay interactive snapshot={snapshot} />
}
