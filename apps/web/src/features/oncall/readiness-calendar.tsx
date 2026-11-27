import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { OnCallShift } from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { ShiftDetailDialog } from './shift-detail-dialog'
import { absoluteApiUrl } from '../../lib/api'
import { HelpPopover } from '../../components/help-popover'
import { helpTriggerClass } from '../../components/help-trigger'

/**
 * The readiness calendar of the office (`specs/04-oncall.md` §4a.2, §4a.3;
 * WP-M10-33, WP-M10-41).
 *
 * Two month grids — the current and the following month — with one week per
 * row from Monday to Sunday and the ISO calendar week on the left. A day is
 * coloured by the state of its shifts, so a gap is visible at a glance. The
 * cell of the current Berlin calendar date is ringed and its date number
 * stands semibold — today without a shift is still ringed, so the office can
 * read the state of the day against the wall clock without counting weeks
 * (WP-M14-156). The
 * shifts come from the page, and the technician travels with the shift: the
 * shift list answers the display data of `user_id` (`ADR-0032`, WP-M14-151), so
 * the calendar names the technician of every shift — also one who is no member
 * of the pool and every role that reads the calendar sees who has the readiness
 * when. The week starts on Monday — the week of the calendar, not the
 * configurable week start of the plan administration.
 *
 * The names are a right of their own (`oncall.read_names`, WP-M14-131): a role
 * without the key reads the same calendar, but the row of a shift answers
 * "besetzt" instead of the name (WP-M14-132). A shift that has a technician is
 * never called "nicht besetzt" — without a name in the answer it reads
 * "besetzt". The API keeps answering the names to `oncall.read` (`specs/01-rbac.md`
 * §3.7); the gate is in this web app.
 */

type Pool = { id: string; name: string }
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

function technicianName(shift: OnCallShift): string | null {
  const technician = shift.technician

  if (technician === undefined || technician === null) {
    return null
  }

  const name = `${technician.givenName} ${technician.familyName}`.trim()

  return name === '' ? technician.email : name
}

export function ReadinessCalendar(props: {
  shifts: OnCallShift[]
  pools: Pool[]
  /** False for a role without `oncall.read_names` (WP-M14-132). */
  showNames?: boolean
  /** The personal iCal feed copied by the share button of the frame. */
  icalUrl?: string
}) {
  const { t, i18n } = useTranslation('oncall')
  const [windowStart, setWindowStart] = useState(() => monthStartIso(new Date()))
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const showNames = props.showNames ?? true

  // The complete address of the personal feed (WP-M23-04): the API answers a
  // path, a calendar app needs host and scheme.
  const icalUrl = props.icalUrl === undefined ? undefined : absoluteApiUrl(props.icalUrl)

  const share = async () => {
    if (!icalUrl) {
      return
    }

    setPanelOpen(true)

    try {
      await navigator.clipboard.writeText(icalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard access can be blocked; the panel shows the address anyway
    }
  }

  // The marker of the current day: the Berlin calendar date of now (WP-M14-156).
  const todayIso = localIsoDate(new Date())

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

  // The dialog shows the shift of the current data, so an action of the admin
  // (the assignment of a technician, the delete of the shift) is visible in it
  // at once — and the dialog closes when the shift is gone (WP-M23-06).
  const selectedShift = useMemo(
    () => props.shifts.find((shift) => shift.id === selectedShiftId) ?? null,
    [props.shifts, selectedShiftId],
  )

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
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-semibold">{t('readiness.title')}</h2>
          <HelpPopover
            className={helpTriggerClass}
            label={t('help:triggerFor', { name: t('readiness.title') })}
            text={t('readiness.hint')}
          />
          <HelpPopover
            className={helpTriggerClass}
            label={t('help:triggerFor', { name: t('readiness.cellName') })}
            text={t('help:readiness.cellMore')}
          />
        </div>
        <div className="flex items-center gap-2">
          {icalUrl ? (
            <button
              aria-label={t('readiness.share')}
              aria-expanded={panelOpen}
              className="flex min-h-11 items-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              onClick={() => void share()}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {copied ? t('readiness.copied') : t('readiness.share')}
            </button>
          ) : null}
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

      {panelOpen && icalUrl ? (
        <div className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-slate-200">
              {t('readiness.icalTitle')}
            </h3>
            <HelpPopover
              className={helpTriggerClass}
              label={t('help:triggerFor', { name: t('readiness.icalTitle') })}
              text={t('readiness.icalHint')}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label={t('readiness.icalTitle')}
              className="min-w-0 flex-1 truncate rounded bg-slate-900 p-2 text-xs text-slate-100"
              readOnly
              value={icalUrl}
            />
            <button
              className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              onClick={() => void share()}
              type="button"
            >
              {copied ? t('readiness.copied') : t('readiness.copy')}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('readiness.icalSubscribe')}</p>
        </div>
      ) : null}

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
                        const isToday = cell.iso === todayIso
                        const stateStyle = cell.inMonth
                          ? state === null
                            ? 'border-slate-800 bg-slate-950/40'
                            : STATE_STYLE[state].cell
                          : 'border-slate-900 bg-slate-950/20 text-slate-600'
                        const cellStyle = isToday
                          ? `${stateStyle} ring-sky-300 ring-1`
                          : stateStyle
                        return (
                          <td
                            className={`min-h-20 rounded border align-top ${cellStyle}`}
                            key={cell.iso}
                            onClick={() => {
                              const first = rows[0]

                              if (first) {
                                setSelectedShiftId(first.id)
                              }
                            }}
                          >
                            <div className="flex h-full flex-col gap-1 p-1">
                              <span className={`text-xs ${isToday ? 'font-semibold' : 'font-medium'}`}>
                                {Number(cell.iso.slice(8))}
                              </span>
                              {cell.inMonth && rows.length > 0 ? (
                                <ul className="flex flex-1 flex-col gap-0.5">
                                  {rows.map((shift) => {
                                    const name = showNames
                                      ? technicianName(shift)
                                      : null
                                    const stateLabel = t(`admin.state.${shift.state}`)
                                    const poolName = poolNames.get(shift.poolId) ?? ''
                                    // A role without the permission `oncall.read_names`
                                    // names nobody: a shift with a technician reads
                                    // "besetzt", a slot without one "nicht besetzt"
                                    // (WP-M14-132). A shift that has a technician is
                                    // never called "nicht besetzt" — without a name in
                                    // the answer it reads "besetzt" (WP-M14-151).
                                    const holder =
                                      name ??
                                      (shift.userId === null
                                        ? t('readiness.unassigned')
                                        : t('readiness.assigned'))

                                    return (
                                      <li className="flex flex-1" key={shift.id}>
                                        <button
                                          className="flex flex-1 w-full h-full flex-wrap items-center gap-x-1 gap-y-1 text-left text-2xs leading-tight text-slate-300"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setSelectedShiftId(shift.id)
                                          }}
                                          aria-label={`${stateLabel} – ${poolName} – ${holder}`}
                                          type="button"
                                        >
                                          <span
                                            aria-hidden="true"
                                            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATE_STYLE[shift.state].dot}`}
                                          />
                                          <span className="font-medium text-slate-200">{stateLabel}</span>
                                          <span className="truncate">{holder}</span>
                                          <span className="truncate text-slate-400">{poolName}</span>
                                        </button>
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

      {selectedShift !== null ? (
        <ShiftDetailDialog
          onClose={() => setSelectedShiftId(null)}
          poolName={poolNames.get(selectedShift.poolId) ?? null}
          shift={selectedShift}
          showNames={showNames}
        />
      ) : null}
    </section>
  )
}
