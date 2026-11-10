import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { OnCallShift } from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * The readiness calendar of the office (`specs/04-oncall.md` §4a.4, WP-M10-33).
 *
 * The week of everybody who has the readiness: every shift with its pool, its
 * technician and its state. The shifts come from the page, the names of the
 * technicians from the members of the pool (`GET /api/v1/oncall/pools/:id/members`).
 * The week starts on Monday — the week of the calendar, not the configurable
 * week start of the plan administration.
 */

type Pool = { id: string; name: string }
type Member = { id: string; givenName: string; familyName: string; email: string }

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

/** The Monday of the week the instant belongs to. */
function weekStartIso(value: Date): string {
  const today = localIsoDate(value)
  const [year, month, day] = today.split('-').map((part) => Number(part))
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  const offset = (weekday + 6) % 7

  return addDaysToIso(today, -offset)
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
  const [week, setWeek] = useState(() => weekStartIso(new Date()))

  const fromIso = useMemo(
    () => fromZonedTime(`${week}T00:00:00`, ONCALL_TIMEZONE).toISOString(),
    [week],
  )
  const toIso = useMemo(
    () => fromZonedTime(`${addDaysToIso(week, 7)}T00:00:00`, ONCALL_TIMEZONE).toISOString(),
    [week],
  )

  const shifts = useMemo(() => {
    const from = Date.parse(fromIso)
    const to = Date.parse(toIso)

    return props.shifts.filter((shift) => {
      const startsAt = new Date(shift.startsAt).getTime()

      return startsAt >= from && startsAt < to
    })
  }, [props.shifts, fromIso, toIso])

  const poolIds = useMemo(
    () => [...new Set(shifts.map((shift) => shift.poolId))],
    [shifts],
  )

  const memberQueries = useQueries({
    queries: poolIds.map((poolId) => ({
      queryKey: ['oncall', 'pool-members', poolId],
      queryFn: () =>
        apiFetch<{ members: Member[] }>(`/v1/oncall/pools/${poolId}/members`),
      retry: false,
      staleTime: 60_000,
    })),
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

  const days = useMemo(() => {
    const grouped = new Map<string, OnCallShift[]>()

    for (const shift of shifts) {
      const key = localIsoDate(new Date(shift.startsAt))
      const rows = grouped.get(key) ?? []
      rows.push(shift)
      grouped.set(key, rows)
    }

    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [shifts])

  const formatInstant = (value: string | Date) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: ONCALL_TIMEZONE,
    }).format(new Date(value))

  const formatDate = (iso: string) => {
    const date = new Date(`${iso}T12:00:00Z`)

    return new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }).format(date)
  }

  const weekLabel = `${formatDate(week)} – ${formatDate(addDaysToIso(week, 6))}`

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
            onClick={() => setWeek(addDaysToIso(week, -7))}
            type="button"
          >
            {t('readiness.previous')}
          </button>
          <span className="text-sm text-slate-300">{weekLabel}</span>
          <button
            className="min-h-11 rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            onClick={() => setWeek(addDaysToIso(week, 7))}
            type="button"
          >
            {t('readiness.next')}
          </button>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t('readiness.empty')}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {days.map(([day, rows]) => (
            <div key={day}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {formatDate(day)}
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {rows.map((shift) => {
                  const technician =
                    shift.userId === null ? null : (namesByUser.get(shift.userId) ?? null)

                  return (
                    <li
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
                      key={shift.id}
                    >
                      <span className="text-slate-300">
                        {formatInstant(shift.startsAt)} – {formatInstant(shift.endsAt)}
                      </span>
                      <span className="text-slate-400">
                        {poolNames.get(shift.poolId) ?? '—'}
                      </span>
                      <span className="font-medium text-slate-200">
                        {technician ?? t('readiness.unassigned')}
                      </span>
                      <span className="rounded bg-slate-900/60 px-2 py-0.5 text-xs text-slate-400">
                        {t(`admin.state.${shift.state}`)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
