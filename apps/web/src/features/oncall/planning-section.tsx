import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { TFunction } from 'i18next'
import { ONCALL_TIMEZONE, type OnCallSettingsResponse, type OnCallShift } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * The weekly planning tool of the readiness (`specs/04-oncall.md` §4a.3,
 * §4a.4, §4a.8).
 *
 * The tool lives in the readiness view where the calendar already shows who is
 * on duty: an admin sees the shifts of a week, generates the slots of the plan,
 * assigns or reassigns a technician, publishes a draft and deletes a slot that
 * did not start. The server guards (`oncall.plan`, `oncall.admin`) stay the only
 * enforcement point — the section is hidden for a role without them and every
 * action is disabled when its key is missing.
 */

type PlanningPool = {
  id: string
  name: string
  active?: boolean
  groupId?: string | null
}

type PoolMember = {
  id: string
  givenName: string
  familyName: string
  email: string
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'oncall_shift_not_found',
  'oncall_shift_locked',
  'oncall_shift_started',
  'oncall_range_too_large',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'oncall'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.errors.${code}`)
}

function formatInstant(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: ONCALL_TIMEZONE,
  }).format(new Date(value))
}

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

function weekStartIso(weekStartWeekday: number): string {
  const today = localIsoDate(new Date())
  const [year, month, day] = today.split('-').map((part) => Number(part))
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  const offset = (weekday - weekStartWeekday + 7) % 7

  return addDaysToIso(today, -offset)
}

function weekBounds(iso: string): { from: string; to: string } {
  return {
    from: fromZonedTime(`${iso}T00:00:00`, ONCALL_TIMEZONE).toISOString(),
    to: fromZonedTime(`${addDaysToIso(iso, 7)}T00:00:00`, ONCALL_TIMEZONE).toISOString(),
  }
}

function displayName(member: PoolMember): string {
  const name = `${member.givenName} ${member.familyName}`.trim()

  return name === '' ? member.email : name
}

function technicianName(shift: OnCallShift): string {
  const technician = shift.technician

  if (technician === undefined || technician === null) {
    return '—'
  }

  const name = `${technician.givenName} ${technician.familyName}`.trim()

  return name === '' ? technician.email : name
}

function usePlanningSettings() {
  return useQuery({
    queryKey: ['oncall', 'settings'],
    queryFn: () => apiFetch<OnCallSettingsResponse>('/v1/settings/oncall'),
    retry: false,
  })
}

function useMembers(poolId: string) {
  return useQuery({
    queryKey: ['oncall', 'members', poolId],
    queryFn: () => apiFetch<{ members: PoolMember[] }>(`/v1/oncall/pools/${poolId}/members`),
    retry: false,
    enabled: poolId !== '',
  })
}

function useShifts(poolId: string, week: string) {
  const { from, to } = weekBounds(week)

  return useQuery({
    queryKey: ['oncall', 'shifts', poolId, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ from, to })

      if (poolId !== '') {
        params.set('poolId', poolId)
      }

      return apiFetch<{ shifts: OnCallShift[] }>(`/v1/oncall/shifts?${params.toString()}`)
    },
    retry: false,
  })
}

export function PlanningSection({
  pools,
  defaultPoolId,
  mayPlan,
  mayAdmin,
}: {
  pools: PlanningPool[]
  defaultPoolId: string | null
  mayPlan: boolean
  mayAdmin: boolean
}) {
  const { t, i18n } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const settings = usePlanningSettings()
  // `null` means "not chosen yet": fall back to the default pool until the user
  // picks a pool or explicitly chooses "all pools" (`''`).
  const [chosenPoolId, setChosenPoolId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => weekStartIso(1))
  const initialisedWeek = useRef(false)

  useEffect(() => {
    if (!initialisedWeek.current && settings.data !== undefined) {
      initialisedWeek.current = true
      setWeekStart(weekStartIso(settings.data.weekStartWeekday))
    }
  }, [settings.data])

  const poolId =
    chosenPoolId ?? defaultPoolId ?? settings.data?.defaultPoolId ?? pools[0]?.id ?? ''
  const shifts = useShifts(poolId, weekStart)
  const members = useMembers(poolId)

  const activePool = pools.find((pool) => pool.id === poolId)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'shifts'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'warnings'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'pools'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'swaps'] })
  }

  const generate = useMutation({
    mutationFn: () => {
      const { from, to } = weekBounds(weekStart)

      return apiFetch<{ created: number; skipped: number }>('/v1/oncall/shifts/generate', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ poolId, from, to }),
      })
    },
    onSuccess: (result) => {
      setFeedback(t('admin.grid.generated', { created: result.created, skipped: result.skipped }))
      invalidate()
    },
  })

  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      apiFetch<OnCallShift>(`/v1/oncall/shifts/${input.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(input.body),
      }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/oncall/shifts/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const mutationError = generate.error ?? update.error ?? remove.error
  const rows = shifts.data?.shifts ?? []
  const locked = (shift: OnCallShift) => new Date(shift.startsAt) <= new Date()
  const candidates = members.data?.members ?? []
  const declined = rows.filter((shift) => shift.state === 'DECLINED').length
  const unfilled = rows.filter((shift) => shift.state === 'UNFILLED').length

  return (
    <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">{t('admin.grid.title')}</h2>
      <p className="text-sm text-slate-400">{t('admin.grid.hint')}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.grid.pool')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={poolId}
            onChange={(event) => setChosenPoolId(event.target.value)}
          >
            <option value="">{t('admin.grid.allPools')}</option>
            {pools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
                {pool.active === false ? ` (${t('admin.pools.activeOff')})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.grid.week')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
          />
        </label>
        <button
          className="rounded border border-slate-600 px-3 py-2 text-slate-200"
          type="button"
          onClick={() => setWeekStart(addDaysToIso(weekStart, -7))}
        >
          {t('admin.grid.previous')}
        </button>
        <button
          className="rounded border border-slate-600 px-3 py-2 text-slate-200"
          type="button"
          onClick={() => setWeekStart(addDaysToIso(weekStart, 7))}
        >
          {t('admin.grid.next')}
        </button>
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          type="button"
          disabled={!mayPlan || poolId === '' || generate.isPending}
          onClick={() => {
            setFeedback(null)
            generate.mutate()
          }}
        >
          {generate.isPending ? t('admin.grid.generating') : t('admin.grid.generate')}
        </button>
      </div>

      {feedback ? <p className="mt-2 text-sm text-emerald-400">{feedback}</p> : null}
      {mutationError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, mutationError)}
        </p>
      ) : null}
      {activePool?.groupId ? (
        <p className="mt-2 text-xs text-slate-500">{t('admin.grid.groupMembersHint')}</p>
      ) : null}

      {shifts.isPending ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.grid.empty')}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-400">
            {t('admin.grid.summary', { total: rows.length, declined, unfilled })}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="py-2">{t('admin.grid.startsAt')}</th>
                  <th className="py-2">{t('admin.grid.endsAt')}</th>
                  <th className="py-2">{t('admin.grid.pool')}</th>
                  <th className="py-2">{t('admin.grid.state')}</th>
                  <th className="py-2">{t('admin.grid.technician')}</th>
                  <th className="py-2">{t('admin.grid.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((shift) => {
                  const pool = pools.find((row) => row.id === shift.poolId)
                  const inMembers = candidates.some((member) => member.id === shift.userId)

                  return (
                    <tr
                      key={shift.id}
                      className={`border-b border-slate-800 align-top ${
                        shift.state === 'DECLINED' ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-2 pr-2">{formatInstant(shift.startsAt, i18n.language)}</td>
                      <td className="py-2 pr-2">{formatInstant(shift.endsAt, i18n.language)}</td>
                      <td className="py-2 pr-2">{pool?.name ?? '—'}</td>
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
                      <td className="py-2 pr-2">
                        <select
                          aria-label={t('admin.grid.technician')}
                          className="rounded bg-slate-950 p-1 text-slate-100"
                          title={
                            shift.state === 'DECLINED' ? t('admin.grid.reassignHint') : undefined
                          }
                          value={shift.userId ?? ''}
                          onChange={(event) =>
                            update.mutate({
                              id: shift.id,
                              body: {
                                userId: event.target.value === '' ? null : event.target.value,
                              },
                            })
                          }
                          disabled={!mayAdmin || update.isPending}
                        >
                          <option value="">{t('admin.grid.unassigned')}</option>
                          {candidates.map((member) => (
                            <option key={member.id} value={member.id}>
                              {displayName(member)}
                            </option>
                          ))}
                          {shift.userId !== null && !inMembers ? (
                            <option value={shift.userId}>{technicianName(shift)}</option>
                          ) : null}
                        </select>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {shift.state === 'DRAFT' ? (
                            <button
                              className="rounded bg-accent-600 px-3 py-1 text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
                              type="button"
                              disabled={!mayAdmin || update.isPending}
                              onClick={() =>
                                update.mutate({ id: shift.id, body: { publish: true } })
                              }
                            >
                              {t('admin.grid.publish')}
                            </button>
                          ) : null}
                          <button
                            className="rounded border border-rose-800 px-3 py-1 text-rose-300 disabled:opacity-50"
                            type="button"
                            title={locked(shift) ? t('admin.grid.locked') : undefined}
                            disabled={
                              !mayAdmin ||
                              remove.isPending ||
                              locked(shift) ||
                              shift.state === 'CONFIRMED' ||
                              shift.state === 'SWAP_REQUESTED'
                            }
                            onClick={() => remove.mutate(shift.id)}
                          >
                            {t('admin.grid.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
