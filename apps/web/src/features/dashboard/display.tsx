import { useTranslation } from 'react-i18next'

import type { DashboardSnapshot } from '@stoerdesk/shared'
import type { TFunction } from 'i18next'

import { i18n } from '../../i18n'
import { formatHours, isHourValue } from '../../lib/duration'
import { useFaultCatalog } from '../../features/tickets/use-fault-catalog'

import { RecentTickets } from './recent-tickets'

/**
 * The wall display (`specs/11-dashboard.md` §11.7).
 *
 * Two sides: the latest reports on the left, the statistics on the right. The
 * display is never interactive — a wall monitor shows, it does not navigate.
 * The durations of the statistics use minutes below one hour and hours from
 * 60 minutes on (`specs/12-stats.md` §12.2).
 */

const TILE_CLASS = 'block rounded-xl border border-slate-700 bg-slate-900/60 p-4'

function TileValue(props: { label: string; value: string; tone: string }) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className={`mt-1 text-4xl font-bold tabular-nums ${props.tone}`}>{props.value}</p>
    </>
  )
}

function Tile(props: { label: string; value: string; tone: string }) {
  return (
    <div className={`${TILE_CLASS} min-h-11`}>
      <TileValue label={props.label} tone={props.tone} value={props.value} />
    </div>
  )
}

function ChannelTileContent(props: {
  t: TFunction<'ticket'>
  channels: NonNullable<DashboardSnapshot['tiles']['channels']>
}) {
  const { t, channels } = props

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {t('dashboard.channels.title')}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {channels.map((channel) => {
          const failing = channel.failed > 0

          return (
            <li className="flex flex-wrap items-baseline gap-2 text-sm" key={channel.name}>
              <span className="font-medium text-slate-200">{channel.name}</span>
              <span className="text-slate-400">
                {t('dashboard.channels.pending', { count: channel.pending })} ·{' '}
                {t('dashboard.channels.failed', { count: channel.failed })}
              </span>
              {failing ? (
                <span className="rounded bg-rose-900/40 px-2 py-0.5 text-xs font-medium text-rose-200">
                  {t('dashboard.channels.failing')}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function EvaluationRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <dt className="text-sm text-slate-400">{props.label}</dt>
      <dd className="text-lg font-semibold text-sky-300">{props.value}</dd>
    </div>
  )
}

function durationLabel(t: TFunction<'ticket'>, minutes: number | null, locale: string): string {
  if (minutes === null) {
    return t('dashboard.evaluations.noData')
  }

  return isHourValue(minutes)
    ? t('dashboard.evaluations.hours', { value: formatHours(minutes, locale) })
    : t('dashboard.evaluations.minutes', { count: minutes })
}

export function DashboardDisplay(props: { snapshot: DashboardSnapshot }) {
  const { t } = useTranslation('ticket')
  const { snapshot } = props

  const { faultFree, evaluations, tiles, topFault, recentTickets } = snapshot
  const channels = tiles.channels ?? null
  const locale = i18n.language
  const catalogLocale = locale === 'en' ? 'en' : 'de'
  const faultCatalog = useFaultCatalog(catalogLocale)
  const topFaultLabel =
    topFault === undefined || topFault === null
      ? ''
      : (faultCatalog.find((entry) => entry.key === topFault.key)?.text ?? topFault.key)

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <RecentTickets rows={recentTickets} />

      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('dashboard.faultFree.title')}
          </p>
          {faultFree.since === null ? (
            <p className="mt-1 text-4xl font-semibold text-emerald-300">
              {t('dashboard.faultFree.none')}
            </p>
          ) : (
            <>
              <p className="mt-1 text-4xl font-semibold text-emerald-300">
                {t('dashboard.faultFree.days', { count: faultFree.days })}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {t('dashboard.faultFree.record', { count: faultFree.recordDays })}
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Tile label={t('dashboard.tiles.open')} tone="text-sky-300" value={String(tiles.open)} />
          <Tile
            label={t('dashboard.tiles.overdue')}
            tone="text-rose-300"
            value={String(tiles.overdue)}
          />
          <Tile
            label={t('dashboard.tiles.unreviewed')}
            tone="text-amber-300"
            value={String(tiles.unreviewed)}
          />
          <Tile
            label={t('dashboard.tiles.pool')}
            tone="text-purple-300"
            value={String(tiles.poolSize)}
          />
        </div>

        {evaluations !== undefined ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.evaluations.title', { count: evaluations.tickets })}
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-2">
              <EvaluationRow
                label={t('dashboard.evaluations.review')}
                value={durationLabel(t, evaluations.averageReviewMinutes, locale)}
              />
              <EvaluationRow
                label={t('dashboard.evaluations.firstResponse')}
                value={durationLabel(t, evaluations.averageFirstResponseMinutes, locale)}
              />
              <EvaluationRow
                label={t('dashboard.evaluations.acknowledge')}
                value={durationLabel(t, evaluations.averageAcknowledgeMinutes, locale)}
              />
              <EvaluationRow
                label={t('dashboard.evaluations.processing')}
                value={durationLabel(t, evaluations.averageProcessingMinutes, locale)}
              />
            </dl>
          </div>
        ) : null}

        {topFault !== undefined && topFault !== null ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('dashboard.topFault.title')}
            </p>
            <p className="mt-1 text-lg font-semibold text-sky-200">{topFaultLabel}</p>
            <p className="mt-1 text-sm text-slate-400">
              {t('dashboard.topFault.count', { count: topFault.count })}
            </p>
          </div>
        ) : null}

        {channels !== null && channels.length > 0 ? (
          <div className={`${TILE_CLASS} min-h-11`}>
            <ChannelTileContent channels={channels} t={t} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
