import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toZonedTime } from 'date-fns-tz'
import type { OnCallShift } from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { ShiftDetailDialog } from './shift-detail-dialog'
import { HelpPopover } from '../../components/help-popover'
import { helpTriggerClass } from '../../components/help-trigger'

/**
 * The shifts of the readiness that wait for a decision
 * (`specs/04-oncall.md` §4a.3, §4a.6, WP-M23-07).
 *
 * The admin of the readiness saw the open shifts only where they happened to
 * be: the calendar of the office shows the month, the weekly plan shows one
 * week. A shift that was offered and never accepted in the week of last
 * Tuesday is in neither of them.
 *
 * The list is fed by the shifts the readiness view loads anyway — no new route,
 * no new query. Every shift that is neither confirmed nor swapped waits for a
 * decision: `UNFILLED` (nobody), `DRAFT` (assigned, not published), `PLANNED`
 * (published, nobody accepted) and `DECLINED` (refused). The horizon is four
 * weeks back and fourteen weeks ahead: a decision about a shift of last year
 * is history, and a shift of next year is still the plan.
 *
 * A click opens the dialog of the shift with the actions of the admin
 * (WP-M23-06): assign a technician, publish a draft, delete the shift.
 */

type Pool = { id: string; name: string }

const BACK_DAYS = 28
const AHEAD_DAYS = 98
const DAY_MS = 24 * 60 * 60 * 1000

/** The states that wait for a decision — every other state holds the duty. */
const OPEN_STATES = new Set(['UNFILLED', 'DRAFT', 'PLANNED', 'DECLINED'])

function formatLocal(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: ONCALL_TIMEZONE,
  }).format(toZonedTime(new Date(value), ONCALL_TIMEZONE))
}

export function OpenShiftsSection(props: {
  shifts: OnCallShift[]
  pools: Pool[]
  /** False for a role without `oncall.read_names` (WP-M14-132). */
  showNames?: boolean
}) {
  const { t, i18n } = useTranslation('oncall')
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  // The clock of the view, read once: the horizon of the list must not move
  // while the admin reads it.
  const [now] = useState(() => Date.now())
  const showNames = props.showNames ?? true

  const poolNames = useMemo(
    () => new Map(props.pools.map((pool) => [pool.id, pool.name])),
    [props.pools],
  )

  const openShifts = useMemo(() => {
    const from = now - BACK_DAYS * DAY_MS
    const to = now + AHEAD_DAYS * DAY_MS

    return props.shifts
      .filter((shift) => {
        const starts = new Date(shift.startsAt).getTime()

        return (
          OPEN_STATES.has(shift.state) && starts >= from && starts <= to
        )
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  }, [props.shifts, now])

  const selectedShift = useMemo(
    () => props.shifts.find((shift) => shift.id === selectedShiftId) ?? null,
    [props.shifts, selectedShiftId],
  )

  if (openShifts.length === 0) {
    return (
      <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold">{t('admin.openShifts.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('admin.openShifts.none')}</p>
      </section>
    )
  }

  return (
    <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-1">
        <h2 className="text-lg font-semibold">{t('admin.openShifts.title')}</h2>
        <HelpPopover
          className={helpTriggerClass}
          label={t('help:triggerFor', { name: t('admin.openShifts.title') })}
          text={t('admin.openShifts.hint')}
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-2">{t('admin.grid.startsAt')}</th>
              <th className="py-2">{t('admin.grid.endsAt')}</th>
              <th className="py-2">{t('admin.grid.pool')}</th>
              <th className="py-2">{t('admin.grid.state')}</th>
              <th className="py-2">{t('admin.grid.technician')}</th>
            </tr>
          </thead>
          <tbody>
            {openShifts.map((shift) => {
              const technician = showNames
                ? (shift.technician
                    ? `${shift.technician.givenName} ${shift.technician.familyName}`.trim() ||
                      shift.technician.email
                    : t('readiness.unassigned'))
                : shift.userId === null
                  ? t('readiness.unassigned')
                  : t('readiness.assigned')

              return (
                <tr className="border-b border-slate-800 align-top" key={shift.id}>
                  <td className="py-2 pr-2">
                    <button
                      className="text-left text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                      onClick={() => setSelectedShiftId(shift.id)}
                      type="button"
                    >
                      {formatLocal(shift.startsAt, i18n.language)}
                    </button>
                  </td>
                  <td className="py-2 pr-2">{formatLocal(shift.endsAt, i18n.language)}</td>
                  <td className="py-2 pr-2">
                    {poolNames.get(shift.poolId) ?? '—'}
                  </td>
                  <td
                    className={`py-2 pr-2 ${
                      shift.state === 'DECLINED'
                        ? 'text-rose-300'
                        : shift.state === 'UNFILLED'
                          ? 'text-rose-400'
                          : ''
                    }`}
                  >
                    {t(`admin.state.${shift.state}`)}
                  </td>
                  <td className="py-2 pr-2">{technician}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
