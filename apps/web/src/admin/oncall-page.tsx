import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import type { TFunction } from 'i18next'
import {
  ONCALL_TIMEZONE,
  type GroupListResponse,
  type OnCallPool,
  type OnCallSettingsResponse,
  type OnCallShift,
  type OncallSwapListResponse,
  type UserListResponse,
  type UserSummary,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * On-call administration (`specs/04-oncall.md` §4a.2–§4a.6, §4a.8, WP-M8-13).
 *
 * Pools, the weekly slot grid, the warnings and pending swaps, and the eight
 * `oncall.*` settings. The grid shows `Europe/Berlin` wall clock but always
 * sends UTC bounds; all timezone math stays in `date-fns-tz` and the shared
 * slot generator. The server guards (`oncall.*`, `settings.*`) are the only
 * enforcement point — the page only hides what the role may not do.
 */

type PoolRow = OnCallPool & { shiftCount: number }
type PoolListResponse = { pools: PoolRow[] }
type WarningsResponse = {
  defaultPoolId: string | null
  unstaffed: OnCallShift[]
  unconfirmed: OnCallShift[]
}
type SwapRow = OncallSwapListResponse['swaps'][number]

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'oncall_pool_name_taken',
  'oncall_pool_in_use',
  'oncall_pool_not_found',
  'oncall_shift_not_found',
  'oncall_shift_locked',
  'oncall_shift_started',
  'oncall_default_pool_not_active',
  'oncall_range_too_large',
  'swap_taken',
  'swap_not_pending',
  'swap_not_accepted',
  'oncall_swap_request_not_found',
] as const

const jsonHeaders = { 'content-type': 'application/json' }
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

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

function displayName(user: UserSummary | undefined): string {
  if (user === undefined) {
    return '—'
  }

  const name = `${user.givenName} ${user.familyName}`.trim()

  return name === '' ? user.email : name
}

function useOncallSettings() {
  return useQuery({
    queryKey: ['oncall', 'settings'],
    queryFn: () => apiFetch<OnCallSettingsResponse>('/v1/settings/oncall'),
    retry: false,
  })
}

function usePools() {
  return useQuery({
    queryKey: ['oncall', 'pools'],
    queryFn: () => apiFetch<PoolListResponse>('/v1/oncall/pools'),
    retry: false,
  })
}

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserListResponse>('/v1/users'),
    retry: false,
  })
}

function useGroups(enabled: boolean) {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<GroupListResponse>('/v1/groups'),
    retry: false,
    enabled,
  })
}

function useWarnings() {
  return useQuery({
    queryKey: ['oncall', 'warnings'],
    queryFn: () => apiFetch<WarningsResponse>('/v1/oncall/warnings'),
    retry: false,
  })
}

function useSwaps(enabled: boolean) {
  return useQuery({
    queryKey: ['oncall', 'swaps'],
    queryFn: () => apiFetch<OncallSwapListResponse>('/v1/oncall/swaps'),
    retry: false,
    enabled,
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

function PoolSection({
  pools,
  groups,
  canAdmin,
}: {
  pools: PoolRow[]
  groups: GroupListResponse['groups']
  canAdmin: boolean
}) {
  const { t } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'pools'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'settings'] })
  }

  const create = useMutation({
    mutationFn: () =>
      apiFetch<OnCallPool>('/v1/oncall/pools', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name, groupId: groupId === '' ? null : groupId }),
      }),
    onSuccess: () => {
      setName('')
      invalidate()
    },
  })

  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      apiFetch<OnCallPool>(`/v1/oncall/pools/${input.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(input.body),
      }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/oncall/pools/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return (
    <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">{t('admin.pools.title')}</h2>
      <p className="text-sm text-slate-400">{t('admin.pools.hint')}</p>

      {pools.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.pools.noPools')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-2">{t('admin.pools.name')}</th>
                <th className="py-2">{t('admin.pools.group')}</th>
                <th className="py-2">{t('admin.pools.shiftCount')}</th>
                <th className="py-2">{t('admin.pools.active')}</th>
                <th className="py-2">{t('admin.pools.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <PoolRowForm
                  key={`${pool.id}-${String(pool.updatedAt)}-${pool.active}`}
                  pool={pool}
                  groups={groups}
                  canAdmin={canAdmin}
                  busy={update.isPending || remove.isPending}
                  onSave={(body) => update.mutate({ id: pool.id, body })}
                  onDelete={() => remove.mutate(pool.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {create.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, create.error)}
        </p>
      ) : null}
      {update.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, update.error)}
        </p>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, remove.error)}
        </p>
      ) : null}

      <form
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-800 pt-4"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <h3 className="w-full text-sm font-semibold">{t('admin.pools.createTitle')}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.pools.name')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canAdmin}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.pools.group')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            disabled={!canAdmin}
          >
            <option value="">{t('admin.pools.noGroup')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={!canAdmin || create.isPending || name.trim() === ''}
        >
          {t('admin.pools.create')}
        </button>
      </form>
    </section>
  )
}

function PoolRowForm({
  pool,
  groups,
  canAdmin,
  busy,
  onSave,
  onDelete,
}: {
  pool: PoolRow
  groups: GroupListResponse['groups']
  canAdmin: boolean
  busy: boolean
  onSave: (body: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const { t } = useTranslation('oncall')
  const [name, setName] = useState(pool.name)
  const [groupId, setGroupId] = useState(pool.groupId ?? '')

  const dirty = name !== pool.name || groupId !== (pool.groupId ?? '')

  return (
    <tr className="border-b border-slate-800 align-top">
      <td className="py-2 pr-2">
        <input
          aria-label={t('admin.pools.name')}
          className="w-44 rounded bg-slate-950 p-1 text-slate-100"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canAdmin}
        />
      </td>
      <td className="py-2 pr-2">
        <select
          aria-label={t('admin.pools.group')}
          className="rounded bg-slate-950 p-1 text-slate-100"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          disabled={!canAdmin}
        >
          <option value="">{t('admin.pools.noGroup')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2">{pool.shiftCount}</td>
      <td className="py-2 pr-2">
        <span className={pool.active ? 'text-emerald-300' : 'text-slate-400'}>
          {pool.active ? t('admin.pools.activeOn') : t('admin.pools.activeOff')}
        </span>
      </td>
      <td className="flex flex-wrap gap-2 py-2">
        <button
          className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50"
          type="button"
          disabled={!canAdmin || busy || !dirty || name.trim() === ''}
          onClick={() =>
            onSave({ name, groupId: groupId === '' ? null : groupId })
          }
        >
          {t('admin.pools.save')}
        </button>
        <button
          className="rounded border border-slate-600 px-3 py-1 text-slate-200 disabled:opacity-50"
          type="button"
          disabled={!canAdmin || busy}
          onClick={() => onSave({ active: !pool.active })}
        >
          {pool.active ? t('admin.pools.deactivate') : t('admin.pools.activate')}
        </button>
        <button
          className="rounded border border-rose-800 px-3 py-1 text-rose-300 disabled:opacity-50"
          type="button"
          title={pool.shiftCount > 0 ? t('admin.pools.deleteHint') : undefined}
          disabled={!canAdmin || busy || pool.shiftCount > 0}
          onClick={onDelete}
        >
          {t('admin.pools.delete')}
        </button>
      </td>
    </tr>
  )
}

function GridSection({
  pools,
  users,
  mayPlan,
  mayAdmin,
  defaultPoolId,
  weekStart,
  setWeekStart,
}: {
  pools: PoolRow[]
  users: UserSummary[]
  mayPlan: boolean
  mayAdmin: boolean
  defaultPoolId: string | null
  weekStart: string
  setWeekStart: (value: string) => void
}) {
  const { t, i18n } = useTranslation('oncall')
  const queryClient = useQueryClient()
  // `null` means "not chosen yet": fall back to the default pool until the user
  // picks a pool or explicitly chooses "all pools" (`''`).
  const [chosenPoolId, setChosenPoolId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const poolId = chosenPoolId ?? defaultPoolId ?? pools[0]?.id ?? ''
  const shifts = useShifts(poolId, weekStart)

  const activePool = pools.find((pool) => pool.id === poolId)
  const members = users.filter(
    (user) =>
      user.active &&
      (activePool?.groupId !== null || user.roleKeys.includes('oncall')),
  )

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
                {pool.active ? '' : ` (${t('admin.pools.activeOff')})`}
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
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
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
        <div className="mt-3 overflow-x-auto">
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
                const user = users.find((row) => row.id === shift.userId)

                return (
                  <tr key={shift.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 pr-2">{formatInstant(shift.startsAt, i18n.language)}</td>
                    <td className="py-2 pr-2">{formatInstant(shift.endsAt, i18n.language)}</td>
                    <td className="py-2 pr-2">{pool?.name ?? '—'}</td>
                    <td className="py-2 pr-2">{t(`admin.state.${shift.state}`)}</td>
                    <td className="py-2 pr-2">
                      <select
                        aria-label={t('admin.grid.technician')}
                        className="rounded bg-slate-950 p-1 text-slate-100"
                        value={shift.userId ?? ''}
                        onChange={(event) =>
                          update.mutate({
                            id: shift.id,
                            body: { userId: event.target.value === '' ? null : event.target.value },
                          })
                        }
                        disabled={!mayAdmin || update.isPending}
                      >
                        <option value="">{t('admin.grid.unassigned')}</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {displayName(member)}
                          </option>
                        ))}
                        {shift.userId !== null &&
                        members.every((member) => member.id !== shift.userId) ? (
                          <option value={shift.userId}>{displayName(user)}</option>
                        ) : null}
                      </select>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {shift.state === 'DRAFT' ? (
                          <button
                            className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50"
                            type="button"
                            disabled={!mayAdmin || update.isPending}
                            onClick={() => update.mutate({ id: shift.id, body: { publish: true } })}
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
      )}
    </section>
  )
}

function WarningsSection({
  unstaffed,
  unconfirmed,
  pools,
  users,
}: {
  unstaffed: OnCallShift[]
  unconfirmed: OnCallShift[]
  pools: PoolRow[]
  users: UserSummary[]
}) {
  const { t, i18n } = useTranslation('oncall')

  const renderRows = (rows: OnCallShift[]) =>
    rows.map((shift) => (
      <li key={shift.id} className="flex flex-wrap gap-x-3 text-sm">
        <span>{formatInstant(shift.startsAt, i18n.language)}</span>
        <span className="text-slate-400">
          {pools.find((pool) => pool.id === shift.poolId)?.name ?? '—'}
        </span>
        <span className="text-slate-400">{t(`admin.state.${shift.state}`)}</span>
        <span className="text-slate-400">
          {displayName(users.find((user) => user.id === shift.userId))}
        </span>
      </li>
    ))

  return (
    <section className="mt-6 rounded border border-amber-900/60 bg-amber-950/20 p-4">
      <h2 className="text-lg font-semibold">{t('admin.warnings.title')}</h2>
      <p className="text-sm text-slate-400">{t('admin.warnings.hint')}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.warnings.unstaffed')}</h3>
          {unstaffed.length === 0 ? (
            <p className="text-sm text-slate-400">{t('admin.warnings.none')}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">{renderRows(unstaffed)}</ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('admin.warnings.unconfirmed')}</h3>
          {unconfirmed.length === 0 ? (
            <p className="text-sm text-slate-400">{t('admin.warnings.none')}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">{renderRows(unconfirmed)}</ul>
          )}
        </div>
      </div>
    </section>
  )
}

function SwapsSection({
  swaps,
  users,
  canAdmin,
}: {
  swaps: SwapRow[]
  users: UserSummary[]
  canAdmin: boolean
}) {
  const { t, i18n } = useTranslation('oncall')
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'swaps'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'shifts'] })
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'warnings'] })
  }

  const decide = useMutation({
    mutationFn: (input: { id: string; action: 'approve' | 'reject' }) =>
      apiFetch(`/v1/oncall/swaps/${input.id}/${input.action}`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  return (
    <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">{t('admin.swaps.title')}</h2>
      <p className="text-sm text-slate-400">{t('admin.swaps.hint')}</p>

      {decide.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, decide.error)}
        </p>
      ) : null}

      {swaps.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.swaps.none')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {swaps.map((swap) => (
            <li
              key={swap.id}
              className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/40 p-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold">{swap.shift.poolName}</span>
                <span>{formatInstant(swap.shift.startsAt, i18n.language)}</span>
                <span className="text-slate-400">{t(`admin.swapStatus.${swap.status}`)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm text-slate-400">
                <span>
                  {t('admin.swaps.requestedBy')}:{' '}
                  {displayName(
                    users.find((user) => user.id === swap.requestedByUserId),
                  )}
                </span>
                <span>
                  {t('admin.swaps.acceptedBy')}:{' '}
                  {displayName(users.find((user) => user.id === swap.acceptedByUserId))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50"
                  type="button"
                  disabled={!canAdmin || decide.isPending || swap.status !== 'ACCEPTED'}
                  title={
                    swap.status === 'ACCEPTED'
                      ? undefined
                      : t('admin.swaps.approveHint')
                  }
                  onClick={() => decide.mutate({ id: swap.id, action: 'approve' })}
                >
                  {t('admin.swaps.approve')}
                </button>
                <button
                  className="rounded border border-rose-800 px-3 py-1 text-rose-300 disabled:opacity-50"
                  type="button"
                  disabled={!canAdmin || decide.isPending}
                  onClick={() => decide.mutate({ id: swap.id, action: 'reject' })}
                >
                  {t('admin.swaps.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SettingsSection({
  settings,
  pools,
  canWrite,
}: {
  settings: OnCallSettingsResponse
  pools: PoolRow[]
  canWrite: boolean
}) {
  const { t } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const [values, setValues] = useState(settings)
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: (body: OnCallSettingsResponse) =>
      apiFetch<OnCallSettingsResponse>('/v1/settings/oncall', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({
          'oncall.week_start_weekday': body.weekStartWeekday,
          'oncall.start_time': body.startTime,
          'oncall.duration_days': body.durationDays,
          'oncall.swap_requires_admin_approval': body.swapRequiresAdminApproval,
          'oncall.escalate_to_group_after_min': body.escalateToGroupAfterMin,
          'oncall.reminder_unconfirmed_h': body.reminderUnconfirmedH,
          'oncall.unfilled_warning_days': body.unfilledWarningDays,
          'oncall.default_pool_id': body.defaultPoolId,
        }),
      }),
    onSuccess: (savedSettings) => {
      setValues(savedSettings)
      setSaved(true)
      void queryClient.setQueryData(['oncall', 'settings'], savedSettings)
    },
  })

  const number = (value: string, fallback: number) => {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : fallback
  }

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setSaved(false)
        save.mutate(values)
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.settings.title')}</h2>
      <p className="text-sm text-slate-400">{t('admin.settings.hint')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.weekStart')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={values.weekStartWeekday}
            onChange={(event) =>
              setValues({ ...values, weekStartWeekday: Number(event.target.value) })
            }
            disabled={!canWrite}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {t(`admin.weekday.${day}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.startTime')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="time"
            required
            value={values.startTime}
            onChange={(event) => setValues({ ...values, startTime: event.target.value })}
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.durationDays')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="number"
            min={1}
            max={28}
            required
            value={values.durationDays}
            onChange={(event) =>
              setValues({ ...values, durationDays: number(event.target.value, values.durationDays) })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.escalateAfter')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="number"
            min={1}
            max={1440}
            required
            value={values.escalateToGroupAfterMin}
            onChange={(event) =>
              setValues({
                ...values,
                escalateToGroupAfterMin: number(
                  event.target.value,
                  values.escalateToGroupAfterMin,
                ),
              })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.reminderHours')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="number"
            min={1}
            max={720}
            required
            value={values.reminderUnconfirmedH}
            onChange={(event) =>
              setValues({
                ...values,
                reminderUnconfirmedH: number(event.target.value, values.reminderUnconfirmedH),
              })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.unfilledDays')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="number"
            min={1}
            max={365}
            required
            value={values.unfilledWarningDays}
            onChange={(event) =>
              setValues({
                ...values,
                unfilledWarningDays: number(event.target.value, values.unfilledWarningDays),
              })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.settings.defaultPool')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={values.defaultPoolId ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                defaultPoolId: event.target.value === '' ? null : event.target.value,
              })
            }
            disabled={!canWrite}
          >
            <option value="">{t('admin.settings.noDefaultPool')}</option>
            {pools
              .filter((pool) => pool.active)
              .map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={values.swapRequiresAdminApproval}
            onChange={(event) =>
              setValues({ ...values, swapRequiresAdminApproval: event.target.checked })
            }
            disabled={!canWrite}
          />
          {t('admin.settings.swapApproval')}
        </label>
      </div>

      {save.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, save.error)}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-emerald-400">{t('admin.settings.saved')}</p> : null}

      <button
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={!canWrite || save.isPending}
      >
        {t('admin.settings.save')}
      </button>
    </form>
  )
}

export function OncallPage() {
  const { t } = useTranslation('oncall')
  const me = useMe()
  const mayRead = usePermission('oncall.read')
  const mayPlan = usePermission('oncall.plan')
  const mayAdmin = usePermission('oncall.admin')
  const maySettingsWrite = usePermission('settings.write')
  const mayReadGroups = usePermission('user.read')
  const pools = usePools()
  const groups = useGroups(mayReadGroups)
  const users = useUsers()
  const warnings = useWarnings()
  const swaps = useSwaps(mayAdmin)
  const settings = useOncallSettings()
  const initialisedWeek = useRef(false)
  const [weekStart, setWeekStart] = useState(() => weekStartIso(1))

  useEffect(() => {
    if (!initialisedWeek.current && settings.data !== undefined) {
      initialisedWeek.current = true
      setWeekStart(weekStartIso(settings.data.weekStartWeekday))
    }
  }, [settings.data])

  if (me.isPending) {
    return <p>{t('admin.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.sessionNotice')}
      </p>
    )
  }

  if (!mayRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.forbiddenNotice')}
      </p>
    )
  }

  const poolRows = pools.data?.pools ?? []
  const userRows = users.data?.users ?? []
  const groupRows = groups.data?.groups ?? []
  const dataError = pools.error ?? users.error ?? warnings.error ?? settings.error

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.hint')}</p>

      {dataError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, dataError)}
        </p>
      ) : null}

      <PoolSection pools={poolRows} groups={groupRows} canAdmin={mayAdmin} />

      <GridSection
        pools={poolRows}
        users={userRows}
        mayPlan={mayPlan}
        mayAdmin={mayAdmin}
        defaultPoolId={warnings.data?.defaultPoolId ?? settings.data?.defaultPoolId ?? null}
        weekStart={weekStart}
        setWeekStart={setWeekStart}
      />

      <WarningsSection
        unstaffed={warnings.data?.unstaffed ?? []}
        unconfirmed={warnings.data?.unconfirmed ?? []}
        pools={poolRows}
        users={userRows}
      />

      <SwapsSection swaps={swaps.data?.swaps ?? []} users={userRows} canAdmin={mayAdmin} />

      {settings.data ? (
        <SettingsSection
          key={JSON.stringify(settings.data)}
          settings={settings.data}
          pools={poolRows}
          canWrite={maySettingsWrite}
        />
      ) : null}
    </main>
  )
}
