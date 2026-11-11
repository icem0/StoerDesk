import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { OnCallShift } from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * The readiness calendar of the office (`specs/04-oncall.md` §4a.2, §4a.3;
 * WP-M10-33, WP-M10-41).
 *
 * Two month grids — the current and the following month — with one week per
 * row from Monday to Sunday and the ISO calendar week on the left. A day is
 * coloured by the state of its shifts, so a gap is visible at a glance. The
 * shifts come from the page, the names of the technicians from the members of
 * the pool (`GET /api/v1/oncall/pools/:id/members`). The week starts on Monday
 * — the week of the calendar, not the configurable week start of the plan
 * administration.
 */

type Pool = { id: string; name: string }
type Member = { id: string; givenName: string; familyName: string; email: string }
type ShiftState =
  | 'UNFILLED'
  | 'DRAFT'
  | 'PLANNED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'SWAP_REQUESTED'
type MonthCell = { iso: string; inMonth: boolean }
type MonthGrid = { key: string; weeks: MonthCell[][] }

const DAY_MS = 24 * 60 * 60 * 1000

/** The order in which a day with several shifts shows the most pressing state. */
const STATE_ORDER: ShiftState[] = [
  'DECLINED',
  'UNFILLED',
  'SWAP_REQUESTED',
  'PLANNED',
  'DRAFT',
  'CONFIRMED',
]

const STATE_STYLE: Record<ShiftState, { cell: string; dot: string }> = {
  CONFIRMED: { cell: 'border-emerald-600/60 bg-emerald-500/15', dot: 'bg-emerald-400' },
  PLANNED: { cell: 'border-amber-500/60 bg-amber-500/15', dot: 'bg-amber-400' },
  SWAP_REQUESTED: { cell: 'border-purple-500/60 bg-purple-500/15', dot: 'bg-purple-400' },
  DECLINED: { cell: 'border-rose-600/60 bg-rose-500/15', dot: 'bg-rose-400' },
  UNFILLED: { cell: 'border-rose-700/70 bg-rose-600/20', dot: 'bg-rose-500' },
  DRAFT: { cell: 'border-slate-600/60 bg-slate-700/30', dot: 'bg-slate-400' },
}

/** The Berlin calendar date of an instant as `YYYY-MM-DD`. */
function localIsoDate(value: Date): string {
  const zoned = toZonedTime(value, ONCALL_TIMEZONE)

  return [
    zoned.getUTCFullYear().toString().padStart(4, '0'),
    (zoned.getUTCMonth() + 1).toString().padStart(2, '0'),
    zoned.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
}

function addDaysToIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const next = new Date(Date.UTC(year!, month! - 1, day! + days))

  return next.toISOString().slice(0, 10)
}

function addMonthsToIso(iso: string, months: number): string {
  const [year, month] = iso.split('-').map((part) => Number(part))
  const next = new Date(Date.UTC(year!, month! - 1 + months, 1))

  return next.toISOString().slice(0, 10)
}

/** The first day of the month the instant belongs to. */
function monthStartIso(value: Date): string {
  return `${localIsoDate(value).slice(0, 7)}-01`
}

/** The Monday of the week the calendar date belongs to. */
function mondayOfIso(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`)
  const weekday = date.getUTCDay()
  const offset = (weekday + 6) % 7

  return addDaysToIso(iso, -offset)
}

/** The ISO 8601 calendar week number of the calendar date. */
function isoWeekNumber(iso: string): number {
  const date = new Date(`${iso}T12:00:00Z`)
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))

  return Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

function buildMonths(startIso: string): MonthGrid[] {
  return [0, 1].map((offset) => {
    const first = addMonthsToIso(startIso, offset)
    const last = addDaysToIso(addMonthsToIso(first, 1), -1)
    const weeks: MonthCell[][] = []
    let cursor = mondayOfIso(first)

    while (cursor <= last) {
      const row: MonthCell[] = []

      for (let index = 0; index < 7; index += 1) {
        const iso = addDaysToIso(cursor, index)
        row.push({ iso, inMonth: iso >= first && iso <= last })
      }

      weeks.push(row)
      cursor = addDaysToIso(cursor, 7)
    }

    return { key: first, weeks }
  })
}

function aggregateState(rows: OnCallShift[]): ShiftState | null {
  for (const candidate of STATE_ORDER) {
    if (rows.some((row) => row.state === candidate)) {
      return candidate
    }
  }

  return null
}

function monthLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))
}

function memberName(member: Member | undefined): string | null {
  if (member === undefined) {
    return null
  }

  const name = `${member.givenName} ${member.familyName}`.trim()

  return name === '' ? member.email : name
}

export function ReadinessCalendar(props: { shifts: OnCallShift[]; pools: Pool[] }) {
  const { t, i18n } = useTranslation('oncall')
  const [windowStart, setWindowStart] = useState(() => monthStartIso(new Date()))

  const fromIso = useMemo(
    () => fromZonedTime(`${windowStart}T00:00:00`, ONCALL_TIMEZONE).toISOString(),
    [windowStart],
  )
  const toIso = useMemo(
    () =>
      fromZonedTime(
        `${addMonthsToIso(windowStart, 2)}T00:00:00`,
        ONCALL_TIMEZONE,
      ).toISOString(),
    [windowStart],
  )

  const shifts = useMemo(() => {
    const from = Date.parse(fromIso)
    const to = Date.parse(toIso)

    return props.shifts.filter(
      (shift) =>
        new Date(shift.startsAt).getTime() < to && new Date(shift.endsAt).getTime() > from,
    )
  }, [props.shifts, fromIso, toIso])

  // The key of the pools keeps the queries stable — a new array on every
  // render would restart them for every render.
  const poolKey = useMemo(
    () => [...new Set(shifts.map((shift) => shift.poolId))].sort().join(','),
    [shifts],
  )

  const memberQueries = useQueries({
    queries: useMemo(
      () =>
        poolKey === ''
          ? []
          : poolKey.split(',').map((poolId) => ({
              queryKey: ['oncall', 'pool-members', poolId],
              queryFn: () =>
                apiFetch<{ members: Member[] }>(`/v1/oncall/pools/${poolId}/members`),
              retry: false,
              staleTime: 60_000,
            })),
      [poolKey],
    ),
  })

  const namesByUser = new Map<string, string>()

  for (const query of memberQueries) {
    for (const member of query.data?.members ?? []) {
      const name = memberName(member)

      if (name !== null) {
        namesByUser.set(member.id, name)
      }
    }
  }

  const poolNames = useMemo(
    () => new Map(props.pools.map((pool) => [pool.id, pool.name])),
    [props.pools],
  )

  const months = useMemo(() => buildMonths(windowStart), [windowStart])

  const shiftsByDay = useMemo(() => {
    const grouped = new Map<string, OnCallShift[]>()

    for (const month of months) {
      for (const week of month.weeks) {
        for (const cell of week) {
          if (!cell.inMonth || grouped.has(cell.iso)) {
            continue
          }

          const dayStart = fromZonedTime(
            `${cell.iso}T00:00:00`,
            ONCALL_TIMEZONE,
          ).getTime()
          const dayEnd = fromZonedTime(
            `${addDaysToIso(cell.iso, 1)}T00:00:00`,
            ONCALL_TIMEZONE,
          ).getTime()

          grouped.set(
            cell.iso,
            shifts.filter(
              (shift) =>
                new Date(shift.startsAt).getTime() < dayEnd &&
                new Date(shift.endsAt).getTime() > dayStart,
            ),
          )
        }
      }
    }

    return grouped
  }, [months, shifts])

  const weekdayLabels = useMemo(() => {
    const monday = Date.UTC(2024, 0, 1, 12)

    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(new Date(monday + index * DAY_MS)),
    )
  }, [i18n.language])

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('readiness.title')}</h2>
          <p className="text-sm text-slate-400">{t('readiness.hint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="min-h-11 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            onClick={() => setWindowStart(addMonthsToIso(windowStart, -1))}
            type="button"
          >
            {t('readiness.previous')}
          </button>
          <button
            className="min-h-11 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            onClick={() => setWindowStart(addMonthsToIso(windowStart, 1))}
            type="button"
          >
            {t('readiness.next')}
          </button>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        {STATE_ORDER.map((state) => (
          <li className="flex items-center gap-1" key={state}>
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${STATE_STYLE[state].dot}`}
            />
            {t(`admin.state.${state}`)}
          </li>
        ))}
      </ul>

      {shifts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{t('readiness.empty')}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-6">
        {months.map((month) => (
          <div key={month.key}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {monthLabel(month.key, i18n.language)}
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th
                      className="w-14 text-left text-xs font-medium text-slate-500"
                      scope="col"
                    >
                      {t('readiness.weekColumn')}
                    </th>
                    {weekdayLabels.map((label) => (
                      <th
                        className="text-center text-xs font-medium text-slate-400"
                        key={label}
                        scope="col"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {month.weeks.map((week) => (
                    <tr key={week[0]!.iso}>
                      <th
                        className="text-left align-top text-xs font-normal text-slate-500"
                        scope="row"
                      >
                        {isoWeekNumber(week[0]!.iso)}
                      </th>
                      {week.map((cell) => {
                        const rows = shiftsByDay.get(cell.iso) ?? []
                        const state = aggregateState(rows)
                        const cellStyle = cell.inMonth
                          ? state === null
                            ? 'border-slate-800 bg-slate-950/40'
                            : STATE_STYLE[state].cell
                          : 'border-slate-900 bg-slate-950/20 text-slate-600'

                        return (
                          <td
                            className={`h-20 rounded border align-top ${cellStyle}`}
                            key={cell.iso}
                          >
                            <div className="flex h-full flex-col gap-1 p-1">
                              <span className="text-xs font-medium">
                                {Number(cell.iso.slice(8))}
                              </span>
                              {cell.inMonth && rows.length > 0 ? (
                                <ul className="flex flex-col gap-0.5">
                                  {rows.map((shift) => {
                                    const technician =
                                      shift.userId === null
                                        ? null
                                        : (namesByUser.get(shift.userId) ?? null)
                                    const stateLabel = t(`admin.state.${shift.state}`)
                                    const poolName = poolNames.get(shift.poolId) ?? ''

                                    return (
                                      <li
                                        className="flex items-center gap-1 text-[10px] leading-tight text-slate-300"
                                        key={shift.id}
                                        title={`${stateLabel} – ${poolName}`}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATE_STYLE[shift.state].dot}`}
                                        />
                                        <span className="truncate">
                                          {technician ?? t('readiness.unassigned')}
                                        </span>
                                        <span className="sr-only">{poolName}</span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : null}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
