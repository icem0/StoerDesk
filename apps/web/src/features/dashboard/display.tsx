import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { DashboardSnapshot } from '@stoerdesk/shared'
import type { TFunction } from 'i18next'

import { OpenTickets } from './open-tickets'

/**
 * One display for both surfaces (WP-M10-36): the start page of the office and
 * the wall monitor render the same blocks of the dashboard — first the
 * statistics (the fault-free counter, the four tiles and the evaluations of
 * the averages), then the list of the open tickets with the mini timeline
 * and the last entry of the history, then the channel tile.
 *
 * `interactive` decides whether the display can be used: on the start page
 * every tile and every ticket number is a link and the primary action is
 * offered; on the wall monitor nothing is clickable — it is a display only,
 * so no link and no action button is rendered there.
 */

const TILE_CLASS =
  'block rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

function TileValue(props: { label: string; value: string; tone: string }) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className={`mt-1 text-4xl font-bold tabular-nums ${props.tone}`}>{props.value}</p>
    </>
  )
}

function Tile(props: { label: string; value: string; tone: string; to: string; interactive: boolean }) {
  return props.interactive ? (
    <Link className={`${TILE_CLASS} min-h-11`} to={props.to}>
      <TileValue label={props.label} tone={props.tone} value={props.value} />
    </Link>
  ) : (
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

function minutesLabel(t: TFunction<'ticket'>, minutes: number | null): string {
  return minutes === null ? t('dashboard.evaluations.noData') : t('dashboard.evaluations.minutes', { count: minutes })
}

export function DashboardDisplay(props: { snapshot: DashboardSnapshot; interactive: boolean }) {
  const { t } = useTranslation('ticket')
  const { snapshot, interactive } = props

  const { faultFree, evaluations, tiles, burningNow } = snapshot
  const channels = tiles.channels ?? null

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <h1 className="text-lg font-semibold">{t('dashboard.greeting')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('dashboard.hint')}</p>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
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

        {interactive ? (
          <Link
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            to="/tickets/create"
          >
            {t('dashboard.primaryAction')}
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          interactive={interactive}
          label={t('dashboard.tiles.open')}
          to="/tickets?open=true"
          tone="text-sky-300"
          value={String(tiles.open)}
        />
        <Tile
          interactive={interactive}
          label={t('dashboard.tiles.overdue')}
          to="/tickets?overdue=true"
          tone="text-rose-300"
          value={String(tiles.overdue)}
        />
        <Tile
          interactive={interactive}
          label={t('dashboard.tiles.unreviewed')}
          to="/tickets?status=NEW"
          tone="text-amber-300"
          value={String(tiles.unreviewed)}
        />
        <Tile
          interactive={interactive}
          label={t('dashboard.tiles.pool')}
          to="/tickets?status=OFFERED"
          tone="text-purple-300"
          value={String(tiles.poolSize)}
        />
      </div>

      {evaluations !== undefined ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('dashboard.evaluations.title', { count: evaluations.tickets })}
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EvaluationRow
              label={t('dashboard.evaluations.review')}
              value={minutesLabel(t, evaluations.averageReviewMinutes)}
            />
            <EvaluationRow
              label={t('dashboard.evaluations.firstResponse')}
              value={minutesLabel(t, evaluations.averageFirstResponseMinutes)}
            />
            <EvaluationRow
              label={t('dashboard.evaluations.acknowledge')}
              value={minutesLabel(t, evaluations.averageAcknowledgeMinutes)}
            />
            <EvaluationRow
              label={t('dashboard.evaluations.processing')}
              value={minutesLabel(t, evaluations.averageProcessingMinutes)}
            />
          </dl>
        </div>
      ) : null}

      <OpenTickets generatedAt={snapshot.generatedAt} linkRows={interactive} rows={burningNow} />

      {channels !== null && channels.length > 0 ? (
        interactive ? (
          <Link className={`${TILE_CLASS} min-h-11`} to="/admin">
            <ChannelTileContent channels={channels} t={t} />
          </Link>
        ) : (
          <div className={`${TILE_CLASS} min-h-11`}>
            <ChannelTileContent channels={channels} t={t} />
          </div>
        )
      ) : null}
    </section>
  )
}
