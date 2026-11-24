import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type {
  ComplianceResponse,
  DeclinesResponse,
  FrequencyResponse,
  ReactionTimesResponse,
  TopObjectsResponse,
  TrendsResponse,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../../auth/usePermission'
import { apiBaseUrl, apiFetch, type ApiError } from '../../lib/api'
import { formatHours, isHourValue } from '../../lib/duration'
import { ChartLegend, BarChart, HorizontalBars, LineChart, type ChartSeries } from './charts'

/**
 * Statistics page at `/stats` (`specs/12-stats.md` §12.1–§12.5, §12.9, WP-M9-15).
 *
 * The filter state lives in the URL like the ticket list. The four JSON sections
 * come from `/api/v1/stats/*`; the CSV button downloads the same filter through
 * `/api/v1/stats/export.csv` and is only shown with `stats.export`. The series is
 * an inline SVG, the groupings and objects are accessible tables — no chart
 * library and no client-side aggregation.
 */

const RANGES = ['week', 'month', 'quarter', 'year', 'custom'] as const
type RangeKey = (typeof RANGES)[number]

const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
const BUCKETS = ['day', 'week', 'month'] as const

function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)

  return toDateInput(date)
}

const PRESET_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  week: 6,
  month: 29,
  quarter: 89,
  year: 364,
}

function presetRange(range: RangeKey): { from: string; to: string } {
  const today = toDateInput(new Date())

  if (range === 'custom') {
    return { from: daysAgo(29), to: today }
  }

  return { from: daysAgo(PRESET_DAYS[range]), to: today }
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)} %`
}

/**
 * The label of a bucket on the x-axis of a diagram: the day for the buckets of
 * a day and a week, the month for the buckets of a month.
 */
function bucketLabelOf(instant: string, bucket: string, locale: string): string {
  const date = new Date(instant)

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: bucket === 'month' ? 'short' : '2-digit',
    ...(bucket === 'month' ? { year: '2-digit' } : {}),
  }).format(date)
}

function useSection<T>(path: string, query: string) {
  return useQuery({
    queryKey: ['stats', path, query],
    queryFn: () => apiFetch<T>(`/v1/stats/${path}?${query}`),
    retry: false,
  })
}

/** One row of a grouping (`specs/12-stats.md` §12.3, ADR-0049 decision 2). */
type GroupRow = {
  key: string
  count: number
  labelDe?: string
  labelEn?: string
}

function GroupTable(props: {
  caption: string
  rows: GroupRow[]
  keyLabel: string
  countLabel: string
  /** The readable text of the row; the key is the fallback (ADR-0049). */
  labelOf?: (row: GroupRow) => string
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="pb-1 text-left font-medium text-slate-300">{props.caption}</caption>
      <thead>
        <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-1 pr-2 font-medium">
            {props.keyLabel}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {props.countLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.length === 0 ? (
          <tr>
            <td className="py-1 text-slate-500" colSpan={2}>
              —
            </td>
          </tr>
        ) : (
          props.rows.map((row) => (
            <tr className="border-b border-slate-800" key={row.key}>
              <td className="py-1 pr-2 text-slate-200">
                {props.labelOf ? props.labelOf(row) : row.key}
              </td>
              <td className="py-1 text-right tabular-nums text-slate-300">{row.count}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function FrequencyChart(props: {
  series: FrequencyResponse['series']
  ariaLabel: string
  bucket: string
}) {
  const { t, i18n } = useTranslation('stats')
  const { series, ariaLabel, bucket } = props
  const labels = series.map((point) => bucketLabelOf(point.bucketStart, bucket, i18n.language))
  const values = series.map((point) => point.total)
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(0, ...values)
  const average = values.length > 0 ? total / values.length : 0

  return (
    <>
      <BarChart ariaLabel={ariaLabel} formatValue={(value) => String(value)} labels={labels} values={values} />
      <p className="mt-1 text-sm text-slate-400">
        {t('chart.summary', {
          total,
          average: average.toFixed(1),
          max,
        })}
      </p>
    </>
  )
}

export function StatsPage() {
  const { t, i18n } = useTranslation('stats')
  const me = useMe()
  const mayRead = usePermission('stats.read')
  const mayExport = usePermission('stats.export')
  const [searchParams, setSearchParams] = useSearchParams()

  const rangeParam = searchParams.get('range')
  const range: RangeKey = RANGES.includes(rangeParam as RangeKey)
    ? (rangeParam as RangeKey)
    : 'month'
  const defaults = presetRange(range)
  const from = searchParams.get('from') ?? defaults.from
  const to = searchParams.get('to') ?? defaults.to
  const bucketParam = searchParams.get('bucket')
  const bucket = BUCKETS.includes(bucketParam as (typeof BUCKETS)[number])
    ? (bucketParam as (typeof BUCKETS)[number])
    : 'day'

  const filter = new URLSearchParams({ from, to })
  for (const key of ['objectNo', 'systemType', 'priority', 'technician'] as const) {
    const value = searchParams.get(key)
    if (value !== null && value !== '') {
      filter.set(key, value)
    }
  }
  for (const key of ['includeTest', 'includeSpam'] as const) {
    if (searchParams.get(key) === 'true') {
      filter.set(key, 'true')
    }
  }

  const query = filter.toString()
  const frequencyQuery = `${query}&bucket=${bucket}`

  const reaction = useSection<ReactionTimesResponse>('reaction-times', query)
  const frequency = useSection<FrequencyResponse>('frequency', frequencyQuery)
  const trends = useSection<TrendsResponse>('trends', frequencyQuery)
  const objects = useSection<TopObjectsResponse>('objects', query)
  const compliance = useSection<ComplianceResponse>('compliance', query)
  const declines = useSection<DeclinesResponse>('declines', query)

  if (me.isPending) {
    return <p className="p-6 text-sm text-slate-400">{t('loading')}</p>
  }

  const error = (reaction.error ?? frequency.error ?? trends.error ?? objects.error) as ApiError | null

  if (!mayRead) {
    return <p className="p-6 text-sm text-rose-400">{t('forbidden')}</p>
  }

  const phases = [
    { key: 'review', data: reaction.data?.review },
    { key: 'acknowledge', data: reaction.data?.acknowledge },
  ] as const

  const exportHref = `${apiBaseUrl}/v1/stats/export.csv?${frequencyQuery}`
  const duration = (minutes: number): string =>
    isHourValue(minutes)
      ? t('reaction.hours', { value: formatHours(minutes, i18n.language) })
      : t('reaction.minutes', { value: minutes })

  const locale = i18n.language === 'en' ? 'en' : 'de'

  /**
   * The readable text of a row of a grouping (ADR-0049 decision 2): the label
   * of the catalog in the language of the interface, the key as the fallback
   * for a value that no catalog knows.
   */
  const catalogLabel = (row: GroupRow): string => {
    const label = locale === 'en' ? row.labelEn : row.labelDe

    return label !== undefined && label !== '' ? label : row.key
  }

  /** The system type is a free text; the known types come from the settings. */
  const systemTypeLabel = (row: GroupRow): string =>
    t(`settings:admin.escalation.condition.values.systemType.${row.key}`, { defaultValue: row.key })

  /** The source of the report is a fixed list of three values. */
  const sourceLabel = (row: GroupRow): string =>
    t(`frequency.source.${row.key}`, { defaultValue: row.key })

  /**
   * The label of a bucket on the x-axis of a diagram: the day for the buckets
   * of a day and a week, the month for the buckets of a month.
   */
  const bucketLabel = (instant: string): string => bucketLabelOf(instant, bucket, i18n.language)

  /** A duration of the axis and of the tooltip. */
  const trendValue = (minutes: number): string =>
    isHourValue(minutes)
      ? t('reaction.hours', { value: formatHours(minutes, i18n.language) })
      : t('reaction.minutes', { value: minutes })

  const trendPoints = trends.data?.points ?? []
  const trendLabels = trendPoints.map((point) => bucketLabel(point.bucketStart))
  const reactionSeries: ChartSeries[] = [
    {
      label: t('reaction.phase.review'),
      values: trendPoints.map((point) => point.reviewMinutes),
      stroke: 'stroke-sky-400',
      fill: 'fill-sky-400',
      swatch: 'bg-sky-400',
    },
    {
      label: t('reaction.phase.acknowledge'),
      values: trendPoints.map((point) => point.acknowledgeMinutes),
      stroke: 'stroke-emerald-400',
      fill: 'fill-emerald-400',
      swatch: 'bg-emerald-400',
    },
  ]
  const processingSeries: ChartSeries[] = [
    {
      label: t('trend.processing'),
      values: trendPoints.map((point) => point.processingMinutes),
      stroke: 'stroke-violet-400',
      fill: 'fill-violet-400',
      swatch: 'bg-violet-400',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('hint')}</p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const next = new URLSearchParams()
          const nextRange = String(form.get('range') ?? 'month')
          next.set('range', nextRange)

          if (nextRange === 'custom') {
            next.set('from', String(form.get('from') ?? from))
            next.set('to', String(form.get('to') ?? to))
          }

          for (const key of ['objectNo', 'systemType', 'priority', 'technician'] as const) {
            const value = String(form.get(key) ?? '').trim()
            if (value !== '') {
              next.set(key, value)
            }
          }

          if (form.get('bucket') !== null) {
            next.set('bucket', String(form.get('bucket')))
          }
          if (form.get('includeTest') === 'on') {
            next.set('includeTest', 'true')
          }
          if (form.get('includeSpam') === 'on') {
            next.set('includeSpam', 'true')
          }

          setSearchParams(next)
        }}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            {t('range.label')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={range}
              name="range"
            >
              {RANGES.map((option) => (
                <option key={option} value={option}>
                  {t(`range.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('range.from')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={from}
              name="from"
              type="date"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('range.to')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={to}
              name="to"
              type="date"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('filters.bucket')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={bucket}
              name="bucket"
            >
              {BUCKETS.map((option) => (
                <option key={option} value={option}>
                  {t(`bucket.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('filters.objectNo')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={searchParams.get('objectNo') ?? ''}
              name="objectNo"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('filters.systemType')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={searchParams.get('systemType') ?? ''}
              name="systemType"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('filters.priority')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={searchParams.get('priority') ?? ''}
              name="priority"
            >
              <option value="">{t('filters.all')}</option>
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {t(`priority.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('filters.technician')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              defaultValue={searchParams.get('technician') ?? ''}
              name="technician"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              defaultChecked={searchParams.get('includeTest') === 'true'}
              name="includeTest"
              type="checkbox"
            />
            {t('filters.includeTest')}
          </label>
          <label className="flex items-center gap-2">
            <input
              defaultChecked={searchParams.get('includeSpam') === 'true'}
              name="includeSpam"
              type="checkbox"
            />
            {t('filters.includeSpam')}
          </label>

          <button
            className="min-h-11 rounded-lg bg-sky-600 px-4 font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            type="submit"
          >
            {t('filters.apply')}
          </button>

          {mayExport ? (
            <a
              className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 font-medium text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              href={exportHref}
            >
              {t('export.button')}
            </a>
          ) : null}
        </div>
      </form>

      {error !== null ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('loadError')}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">{t('reaction.title')}</h2>
        <p className="text-sm text-slate-400">{t('reaction.hint')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {phases.map((phase) => (
            <div className="rounded-lg border border-slate-800 p-3" key={phase.key}>
              <p className="text-sm font-medium text-slate-300">{t(`reaction.phase.${phase.key}`)}</p>
              {phase.data === undefined ? (
                <p className="mt-1 text-sm text-slate-500">{t('loading')}</p>
              ) : (
                <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                  <dt className="text-slate-500">{t('reaction.count')}</dt>
                  <dd className="text-right tabular-nums text-slate-200">{phase.data.count}</dd>
                  <dt className="text-slate-500" title={t('reaction.medianHint')}>
                    {t('reaction.median')}
                  </dt>
                  <dd className="text-right tabular-nums text-slate-200">
                    {duration(phase.data.medianMinutes)}
                  </dd>
                  <dt className="text-slate-500" title={t('reaction.averageHint')}>
                    {t('reaction.average')}
                  </dt>
                  <dd className="text-right tabular-nums text-slate-200">
                    {duration(phase.data.averageMinutes)}
                  </dd>
                  <dt className="text-slate-500" title={t('reaction.p90Hint')}>
                    {t('reaction.p90')}
                  </dt>
                  <dd className="text-right tabular-nums text-slate-200">
                    {duration(phase.data.p90Minutes)}
                  </dd>
                </dl>
              )}
            </div>
          ))}
        </div>
        {reaction.data !== undefined ? (
          <p className="mt-3 text-sm text-slate-400">
            {t('reaction.pausedTickets', { count: reaction.data.pausedTickets })} ·{' '}
            {isHourValue(reaction.data.pauseMinutes)
              ? t('reaction.pauseHours', {
                  value: formatHours(reaction.data.pauseMinutes, i18n.language),
                })
              : t('reaction.pauseMinutes', { count: reaction.data.pauseMinutes })}
          </p>
        ) : null}

        <h3 className="mt-5 text-sm font-medium text-slate-300">{t('trend.reactionTitle')}</h3>
        <p className="text-sm text-slate-400">{t('trend.hint', { bucket: t(`bucket.${bucket}`) })}</p>
        {trendPoints.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('trend.empty')}</p>
        ) : (
          <>
            <LineChart
              ariaLabel={t('trend.aria', {
                metric: t('trend.reactionTitle'),
                bucket: t(`bucket.${bucket}`),
              })}
              formatValue={trendValue}
              labels={trendLabels}
              series={reactionSeries}
            />
            <ChartLegend series={reactionSeries} />
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">{t('frequency.title')}</h2>
        {frequency.data === undefined ? (
          <p className="mt-2 text-sm text-slate-500">{t('loading')}</p>
        ) : frequency.data.series.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('frequency.empty')}</p>
        ) : (
          <FrequencyChart
            ariaLabel={t('frequency.seriesAria', { bucket: t(`bucket.${bucket}`) })}
            bucket={bucket}
            series={frequency.data.series}
          />
        )}
        {frequency.data !== undefined ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <GroupTable
              caption={t('frequency.bySystemType')}
              countLabel={t('frequency.count')}
              keyLabel={t('frequency.key')}
              labelOf={(row) => systemTypeLabel(row)}
              rows={frequency.data.bySystemType}
            />
            <GroupTable
              caption={t('frequency.byFaultTemplate')}
              countLabel={t('frequency.count')}
              keyLabel={t('frequency.key')}
              labelOf={(row) => catalogLabel(row)}
              rows={frequency.data.byFaultTemplate}
            />
            <GroupTable
              caption={t('frequency.bySource')}
              countLabel={t('frequency.count')}
              keyLabel={t('frequency.key')}
              labelOf={(row) => sourceLabel(row)}
              rows={frequency.data.bySource}
            />
            <GroupTable
              caption={t('frequency.byDetectedError')}
              countLabel={t('frequency.count')}
              keyLabel={t('frequency.key')}
              labelOf={(row) => catalogLabel(row)}
              rows={frequency.data.byDetectedError}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">{t('trend.processingTitle')}</h2>
        <p className="text-sm text-slate-400">{t('trend.hint', { bucket: t(`bucket.${bucket}`) })}</p>
        {trendPoints.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('trend.empty')}</p>
        ) : (
          <>
            <LineChart
              ariaLabel={t('trend.aria', {
                metric: t('trend.processingTitle'),
                bucket: t(`bucket.${bucket}`),
              })}
              formatValue={trendValue}
              labels={trendLabels}
              series={processingSeries}
            />
            <ChartLegend series={processingSeries} />
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">{t('objects.title')}</h2>
        <p className="text-sm text-slate-400">{t('objects.hint')}</p>
        {objects.data === undefined ? (
          <p className="mt-2 text-sm text-slate-500">{t('loading')}</p>
        ) : objects.data.topObjects.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t('objects.empty')}</p>
        ) : (
          <>
            <h3 className="mt-3 text-sm font-medium text-slate-300">{t('chart.rankingTitle')}</h3>
            <HorizontalBars
              ariaLabel={t('chart.rankingAria')}
              formatValue={(value) => String(value)}
              rows={objects.data.topObjects.slice(0, 10).map((object) => ({
                key: object.objectNo,
                label: object.objectNo,
                title: object.objectName,
                value: object.count,
              }))}
            />
            <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2 font-medium" scope="col">
                  {t('objects.objectNo')}
                </th>
                <th className="py-1 pr-2 font-medium" scope="col">
                  {t('objects.objectName')}
                </th>
                <th className="py-1 pr-2 text-right font-medium" scope="col">
                  {t('objects.count')}
                </th>
                <th className="py-1 font-medium" scope="col">
                  <span className="sr-only">{t('objects.drilldown')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {objects.data.topObjects.map((object) => (
                <tr className="border-b border-slate-800" key={object.objectNo}>
                  <td className="py-1 pr-2 font-mono text-slate-200">{object.objectNo}</td>
                  <td className="py-1 pr-2 text-slate-200">
                    {object.objectName}
                    {object.conspicuous ? (
                      <span className="ml-2 rounded bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-200">
                        {t('objects.conspicuous')}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-300">
                    {object.count}
                  </td>
                  <td className="py-1 text-right">
                    <a
                      className="text-sky-400 hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      href={`/tickets?objectNo=${encodeURIComponent(object.objectNo)}&from=${from}&to=${to}`}
                    >
                      {t('objects.drilldown')}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">{t('compliance.title')}</h2>
          {compliance.data === undefined ? (
            <p className="mt-2 text-sm text-slate-500">{t('loading')}</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-500">{t('compliance.acknowledged')}</dt>
              <dd className="text-right tabular-nums text-slate-200">
                {compliance.data.acknowledged}
              </dd>
              <dt className="text-slate-500">{t('compliance.onTime')}</dt>
              <dd className="text-right tabular-nums text-slate-200">{compliance.data.onTime}</dd>
              <dt className="text-slate-500">{t('compliance.late')}</dt>
              <dd className="text-right tabular-nums text-slate-200">{compliance.data.late}</dd>
              <dt className="text-slate-500">{t('compliance.openOverdue')}</dt>
              <dd className="text-right tabular-nums text-slate-200">
                {compliance.data.openOverdue}
              </dd>
              <dt className="text-slate-500">{t('compliance.onTimeRate')}</dt>
              <dd className="text-right tabular-nums text-slate-200">
                {compliance.data.onTimeRate === null
                  ? t('compliance.noRate')
                  : percent(compliance.data.onTimeRate)}
              </dd>
            </dl>
          )}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold">{t('declines.title')}</h2>
          {declines.data === undefined ? (
            <p className="mt-2 text-sm text-slate-500">{t('loading')}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-400">
                {t('declines.declineRate')}:{' '}
                <span className="tabular-nums text-slate-200">
                  {declines.data.declineRate === null
                    ? t('declines.noRate')
                    : percent(declines.data.declineRate)}
                </span>
              </p>
              <p className="mt-3 text-sm font-medium text-slate-300">{t('declines.topReasons')}</p>
              {declines.data.topReasons.length === 0 ? (
                <p className="text-sm text-slate-500">{t('declines.empty')}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {declines.data.topReasons.map((reason) => (
                    <li className="flex justify-between gap-2" key={reason.reason}>
                      <span className="text-slate-200">{reason.reason}</span>
                      <span className="tabular-nums text-slate-300">{reason.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
