import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useDashboard } from './use-dashboard'

/**
 * Start page of the internal app (`specs/11-dashboard.md` §11.2–§11.6, WP-M9-14).
 *
 * The index route `/` of the guarded shell. It shows the fault-free counter with
 * its record, the open/overdue/unreviewed/pool tiles, the evaluation block of
 * averages (WP-M10-19b, §11.4a), the on-call tile and the channel tile when
 * present, plus the primary action "Neue Störung melden".
 * The page ends with the tiles; the burning-now list belongs to the wall display
 * (`specs/11-dashboard.md` §11.5). Every tile is one link over its whole area
 * with a 44 px touch target. The evaluation block shows averages only — the
 * worst reaction time is neither calculated nor displayed (ADR-0015).
 */

const TILE_CLASS =
  'block rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'

function Tile(props: {
  label: string
  value: string
  to: string
  tone: string
}) {
  return (
    <Link className={`${TILE_CLASS} min-h-11`} to={props.to}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className={`mt-1 text-3xl font-semibold ${props.tone}`}>{props.value}</p>
    </Link>
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

export function StartPage() {
  const { t, i18n } = useTranslation('ticket')
  const dashboard = useDashboard()
  const snapshot = dashboard.data

  const faultFree = snapshot?.faultFree
  const evaluations = snapshot?.evaluations
  const tiles = snapshot?.tiles
  const onCall = tiles?.onCall ?? null
  const channels = tiles?.channels ?? null

  const minutesLabel = (minutes: number | null): string =>
    minutes === null
      ? t('dashboard.evaluations.noData')
      : t('dashboard.evaluations.minutes', { count: minutes })

  const timeFormat: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  const onCallEndsAt =
    onCall?.endsAt === null || onCall?.endsAt === undefined
      ? null
      : new Date(onCall.endsAt).toLocaleString(i18n.language, timeFormat)

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <h1 className="text-lg font-semibold">{t('dashboard.greeting')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('dashboard.hint')}</p>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('dashboard.faultFree.title')}
          </p>
          {faultFree === undefined ? (
            <p className="mt-1 text-2xl font-semibold text-slate-300">…</p>
          ) : faultFree.since === null ? (
            <p className="mt-1 text-2xl font-semibold text-emerald-300">
              {t('dashboard.faultFree.none')}
            </p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">
                {t('dashboard.faultFree.days', { count: faultFree.days })}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {t('dashboard.faultFree.record', { count: faultFree.recordDays })}
              </p>
            </>
          )}
        </div>

        <Link
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/tickets/create"
        >
          {t('dashboard.primaryAction')}
        </Link>
      </div>

      {dashboard.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('dashboard.loadError')}
        </p>
      ) : dashboard.isPending ? (
        <p className="text-sm text-slate-400">{t('dashboard.loading')}</p>
      ) : null}

      {tiles !== undefined ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={t('dashboard.tiles.open')}
              to="/tickets?open=true"
              tone="text-sky-300"
              value={String(tiles.open)}
            />
            <Tile
              label={t('dashboard.tiles.overdue')}
              to="/tickets?overdue=true"
              tone="text-rose-300"
              value={String(tiles.overdue)}
            />
            <Tile
              label={t('dashboard.tiles.unreviewed')}
              to="/tickets?status=NEW"
              tone="text-amber-300"
              value={String(tiles.unreviewed)}
            />
            <Tile
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
                  value={minutesLabel(evaluations.averageReviewMinutes)}
                />
                <EvaluationRow
                  label={t('dashboard.evaluations.firstResponse')}
                  value={minutesLabel(evaluations.averageFirstResponseMinutes)}
                />
                <EvaluationRow
                  label={t('dashboard.evaluations.acknowledge')}
                  value={minutesLabel(evaluations.averageAcknowledgeMinutes)}
                />
                <EvaluationRow
                  label={t('dashboard.evaluations.processing')}
                  value={minutesLabel(evaluations.averageProcessingMinutes)}
                />
              </dl>
            </div>
          ) : null}

          {onCall !== null ? (
            <Link className={`${TILE_CLASS} min-h-11`} to="/oncall">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('dashboard.onCall.title')}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-200">
                {onCall.kind === 'unstaffed'
                  ? t('dashboard.onCall.unstaffed')
                  : (onCall.name ?? t(`dashboard.onCall.${onCall.kind}`))}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {onCallEndsAt === null
                  ? t('dashboard.onCall.noEnd')
                  : t('dashboard.onCall.endsAt', { time: onCallEndsAt })}
              </p>
              {onCall.warning !== null ? (
                <p className="mt-2 inline-block rounded bg-amber-900/40 px-2 py-1 text-xs font-medium text-amber-200">
                  {t(`dashboard.onCall.warning.${onCall.warning}`)}
                </p>
              ) : null}
            </Link>
          ) : null}

          {channels !== null && channels.length > 0 ? (
            <Link className={`${TILE_CLASS} min-h-11`} to="/admin">
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
            </Link>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
