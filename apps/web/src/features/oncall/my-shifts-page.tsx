import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toZonedTime } from 'date-fns-tz'
import type { OnCallShift } from '@stoerdesk/shared'
import { ONCALL_TIMEZONE } from '@stoerdesk/shared'

import { apiFetch, ApiError } from '../../lib/api'
import { useMe, usePermission } from '../../auth/usePermission'

/**
 * My on-call shifts (`specs/04-oncall.md` §4a.4, §4a.5, §4a.7; WP-M8-14).
 *
 * The signed-in technician sees their own shifts grouped into upcoming and past
 * shifts, confirms and declines planned shifts, requests swaps of confirmed
 * shifts and cancels their own pending swap requests. The personal iCal URL is
 * fetched through `GET /api/v1/oncall/ical-url` so the token never leaves this
 * route as a value the page could log; the page only displays and copies the
 * feed URL it received.
 *
 * Server guards (`oncall.read`/`oncall.confirm`/`oncall.swap`) are the only
 * enforcement point — the page only hides what the role may not do.
 */

const RANGE_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

function formatLocal(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: ONCALL_TIMEZONE,
  }).format(toZonedTime(value, ONCALL_TIMEZONE))
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'oncall_shift_not_found',
  'oncall_shift_started',
  'oncall_decline_reason_required',
  'swap_taken',
  'swap_not_pending',
  'swap_already_open',
  'oncall_swap_request_not_found',
  'unknown',
] as const

function errorMessage(t: ReturnType<typeof useTranslation>['t'], error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.errors.${code}`)
}

type PoolMember = { id: string; givenName: string; familyName: string; email: string }

function MyShiftsPageContent({
  meUserId,
  pools,
  mayConfirm,
  maySwap,
}: {
  meUserId: string
  pools: { id: string; name: string }[]
  mayConfirm: boolean
  maySwap: boolean
}) {
  const { t } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const [now] = useState(() => Date.now())

  const from = new Date(now - RANGE_DAYS * DAY_MS).toISOString()
  const to = new Date(now + RANGE_DAYS * DAY_MS).toISOString()
  const params = new URLSearchParams({ from, to })

  const shiftsQuery = useQuery({
    queryKey: ['oncall', 'my-shifts', from, to],
    queryFn: () =>
      apiFetch<{ shifts: OnCallShift[] }>(`/v1/oncall/shifts?${params.toString()}`),
    retry: false,
  })

  const ical = useQuery({
    queryKey: ['oncall', 'ical-url'],
    queryFn: () => apiFetch<{ url: string }>('/v1/oncall/ical-url'),
    retry: false,
  })

  const memberCache = useRef<Map<string, PoolMember[]>>(new Map())

  const membersOf = useCallback(
    (poolId: string): PoolMember[] => {
      let members = memberCache.current.get(poolId)

      if (members === undefined) {
        const fetched: PoolMember[] = []
        memberCache.current.set(poolId, fetched)
        void apiFetch<{ members: PoolMember[] }>(`/v1/oncall/pools/${poolId}/members`).then(
          (result) => {
            for (const member of result.members) {
              fetched.push(member)
            }
            void queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
          },
        )
        members = fetched
      }

      return members
    },
    [queryClient],
  )

  const poolNames = useMemo(
    () => Object.fromEntries(pools.map((pool) => [pool.id, pool.name])),
    [pools],
  )

  const rows = (shiftsQuery.data?.shifts ?? []).filter((shift) => shift.userId === meUserId)
  const upcoming = rows.filter((shift) => new Date(shift.startsAt).getTime() >= now)
  const past = rows.filter((shift) => new Date(shift.startsAt).getTime() < now)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
  }

  const confirm = useMutation({
    mutationFn: (shiftId: string) =>
      apiFetch(`/v1/oncall/shifts/${shiftId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  })

  const decline = useMutation({
    mutationFn: (input: { shiftId: string; reason: string }) =>
      apiFetch(`/v1/oncall/shifts/${input.shiftId}/decline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: invalidate,
  })

  const requestSwapFn = useCallback(
    async (shiftId: string, targetUserId: string | undefined) => {
      return apiFetch(`/v1/oncall/shifts/${shiftId}/swap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      })
    },
    [],
  )

  const cancelSwapFn = useCallback(
    async (swapId: string) => {
      return apiFetch(`/v1/oncall/swaps/${swapId}/cancel`, { method: 'POST' })
    },
    [],
  )

  const copyIcal = useCallback(async () => {
    const url = ical.data?.url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // clipboard access can be blocked; the URL remains visible and selectable
    }
  }, [ical.data?.url])

  const shiftError = shiftsQuery.error

  if (shiftsQuery.isPending || ical.isPending) {
    return <p className="mt-2 text-sm text-slate-400">{t('admin.loading')}</p>
  }

  if (shiftError) {
    return <p role="alert" className="mt-2 text-sm text-red-400">{errorMessage(t, shiftError)}</p>
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold">{t('admin.myShifts.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">{t('admin.myShifts.hint')}</p>

      {ical.data ? (
        <section className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
          <h2 className="text-lg font-semibold">{t('admin.myShifts.icalTitle')}</h2>
          <p className="mt-1 text-sm text-slate-400">{t('admin.myShifts.icalHint')}</p>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded bg-slate-950 p-2 text-slate-100 text-sm truncate"
              readOnly
              value={ical.data.url}
            />
            <button
              className="rounded bg-sky-700 px-4 py-2 font-medium text-white"
              onClick={copyIcal}
            >
              {t('admin.myShifts.copy')}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('admin.myShifts.icalSubscribe')}
          </p>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{t('admin.myShifts.upcoming')}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">{t('admin.myShifts.none')}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {upcoming.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={{
                  ...shift,
                  poolName: poolNames[shift.poolId] ?? null,
                }}
                mayConfirm={mayConfirm}
                maySwap={maySwap}
                membersOf={membersOf}
                meUserId={meUserId}
                onConfirm={(shiftId) => void confirm.mutate(shiftId)}
                onDecline={(shiftId, reason) =>
                  void decline.mutate({ shiftId, reason })
                }
                onRequestSwap={(shiftId, targetUserId) =>
                  void requestSwapFn(shiftId, targetUserId).then(() => void invalidate())
                }
                onCancelSwap={(swapId) => void cancelSwapFn(swapId).then(() => void invalidate())}
                confirmPending={confirm.isPending}
                declinePending={decline.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{t('admin.myShifts.past')}</h2>
        {past.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">{t('admin.myShifts.none')}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {past.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={{
                  ...shift,
                  poolName: poolNames[shift.poolId] ?? null,
                }}
                mayConfirm={false}
                maySwap={false}
                membersOf={membersOf}
                meUserId={meUserId}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function ShiftCard({
  shift,
  mayConfirm,
  maySwap,
  membersOf,
  meUserId,
  onConfirm,
  onDecline,
  onRequestSwap,
  onCancelSwap,
  confirmPending,
  declinePending,
}: {
  shift: OnCallShift & { poolName: string | null }
  mayConfirm?: boolean
  maySwap?: boolean
  membersOf: (poolId: string) => PoolMember[]
  meUserId: string
  onConfirm?: (shiftId: string) => void
  onDecline?: (shiftId: string, reason: string) => void
  onRequestSwap?: (shiftId: string, targetUserId: string | undefined) => void
  onCancelSwap?: (swapId: string) => void
  confirmPending?: boolean
  declinePending?: boolean
}) {
  const { t, i18n } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineError, setDeclineError] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapTarget, setSwapTarget] = useState<string | undefined>(undefined)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [openSwap, setOpenSwap] = useState<{
    id: string
    status: string
    requestedByUserId: string | null
  } | null>(null)

  const members = swapOpen || openSwap !== null ? membersOf(shift.poolId) : []

  const declineMut = useMutation({
    mutationFn: async () => {
      void onDecline?.(shift.id, declineReason)
    },
    onSuccess: () => {
      setDeclineError(null)
      setDeclineOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
    },
    onError: (error) => {
      setDeclineError(errorMessage(t, error))
    },
  })

  const requestMut = useMutation({
    mutationFn: async () => {
      void onRequestSwap?.(shift.id, swapTarget)
    },
    onSuccess: (result) => {
      const swap = (result as { swap?: { id: string; status: string; requestedByUserId: string | null } } | undefined)?.swap
      if (swap) {
        setOpenSwap(swap)
      }
      setSwapOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
    },
    onError: (error) => {
      setSwapError(errorMessage(t, error))
    },
  })

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (openSwap === null) {
        return
      }

      void onCancelSwap?.(openSwap.id)
    },
    onSuccess: () => {
      setOpenSwap(null)
      void queryClient.invalidateQueries({ queryKey: ['oncall', 'my-shifts'] })
    },
    onError: (error) => {
      setSwapError(errorMessage(t, error))
    },
  })

  const isOwnPendingSwap =
    openSwap !== null &&
    openSwap.status === 'PENDING' &&
    openSwap.requestedByUserId === meUserId

  return (
    <article className="rounded border border-slate-700 bg-slate-900 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 text-sm">
        <span className="font-semibold">
          {t('admin.myShifts.startsAt')}: {formatLocal(new Date(shift.startsAt), i18n.language)}
        </span>
        <span className="font-semibold">
          {t('admin.myShifts.endsAt')}: {formatLocal(new Date(shift.endsAt), i18n.language)}
        </span>
        <span>{t('admin.myShifts.pool')}: {shift.poolName ?? '—'}</span>
        <span className={`font-medium ${stateColor(shift.state)}`}>
          {t(`admin.state.${shift.state}`)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {shift.state === 'PLANNED' && mayConfirm && onConfirm ? (
          <button
            className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50"
            disabled={confirmPending}
            onClick={() => void onConfirm?.(shift.id)}
          >
            {t('admin.myShifts.confirm')}
          </button>
        ) : null}
        {(shift.state === 'PLANNED' || shift.state === 'CONFIRMED') && mayConfirm && onDecline ? (
          <button
            className="rounded border border-rose-800 px-3 py-1 text-rose-300 disabled:opacity-50"
            disabled={declinePending}
            onClick={() => setDeclineOpen(true)}
          >
            {t('admin.myShifts.decline')}
          </button>
        ) : null}
        {shift.state === 'CONFIRMED' && maySwap && onRequestSwap && openSwap === null ? (
          <button
            className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50"
            disabled={requestMut.isPending}
            onClick={() => setSwapOpen(true)}
          >
            {t('admin.myShifts.swap')}
          </button>
        ) : null}
        {isOwnPendingSwap && onCancelSwap ? (
          <button
            className="rounded border border-rose-800 px-3 py-1 text-rose-300 disabled:opacity-50"
            disabled={cancelMut.isPending}
            onClick={() => void cancelMut.mutate()}
          >
            {t('admin.myShifts.cancel')}
          </button>
        ) : null}
      </div>

      {openSwap !== null ? (
        <div className="mt-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-300">
          {t('admin.myShifts.openSwap')}:{' '}
          {openSwap.requestedByUserId === meUserId
            ? t('admin.myShifts.swapSent')
            : colleagueName(openSwap.requestedByUserId, members)}
          {` (${t(`admin.swapStatus.${openSwap.status}`)})`}
        </div>
      ) : null}

      {declineOpen ? (
        <DeclineForm
          reason={declineReason}
          onChange={setDeclineReason}
          onClose={() => setDeclineOpen(false)}
          onSubmit={() => {
            setDeclineError(null)
            void declineMut.mutate()
          }}
          error={declineError}
          pending={declineMut.isPending}
          t={t}
        />
      ) : null}

      {swapOpen ? (
        <SwapForm
          target={swapTarget}
          onChange={setSwapTarget}
          onClose={() => setSwapOpen(false)}
          onSubmit={() => {
            setSwapError(null)
            void requestMut.mutate()
          }}
          members={members.filter((member) => member.id !== meUserId)}
          pending={requestMut.isPending}
          error={swapError}
          t={t}
        />
      ) : null}
    </article>
  )

  function colleagueName(userId: string | null, members: PoolMember[]): string {
    if (userId === null) {
      return t('admin.myShifts.swapSent')
    }

    const member = members.find((m) => m.id === userId)

    return member
      ? `${member.givenName} ${member.familyName}`.trim() || member.email
      : t('admin.myShifts.swapSent')
  }
}

function stateColor(state: string): string {
  return {
    PLANNED: 'text-amber-400',
    CONFIRMED: 'text-emerald-400',
    DECLINED: 'text-rose-400',
    SWAP_REQUESTED: 'text-purple-400',
  }[state] ?? 'text-slate-400'
}

function DeclineForm({
  reason,
  onChange,
  onClose,
  onSubmit,
  error,
  pending,
  t,
}: {
  reason: string
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: (reason: string) => void
  error: string | null
  pending: boolean | undefined
  t: ReturnType<typeof useTranslation>['t'],
}) {
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/60 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = reason.trim()
        if (trimmed.length < 5) {
          setLocalError(t('admin.myShifts.errors.reasonTooShort'))
          return
        }
        setLocalError(null)
        onSubmit(trimmed)
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.myShifts.declineReason')}
        <textarea
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={500}
          value={reason}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {error ?? localError ? (
        <p role="alert" className="mt-1 text-xs text-rose-400">{error ?? localError}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="text-sm text-slate-400 hover:text-slate-200"
          onClick={onClose}
        >
          {t('common:back')}
        </button>
        <button
          className="rounded border border-rose-800 px-3 py-1 text-rose-300"
          type="submit"
          disabled={pending}
        >
          {t('admin.myShifts.decline')}
        </button>
      </div>
    </form>
  )
}

function SwapForm({
  target,
  onChange,
  onClose,
  onSubmit,
  members,
  pending,
  error,
  t,
}: {
  target: string | undefined
  onChange: (value: string | undefined) => void
  onClose: () => void
  onSubmit: () => void
  members: PoolMember[]
  pending: boolean | undefined
  error: string | null
  t: ReturnType<typeof useTranslation>['t'],
}) {
  const wholePool = target === undefined
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/60 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        setLocalError(null)
        onSubmit()
      }}
    >
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input checked={wholePool} onChange={() => onChange(undefined)} type="radio" />
          {t('admin.myShifts.swapWholePool')}
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={!wholePool}
            onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            type="radio"
          />
          {t('admin.myShifts.swapColleague')}
          <select
            className="ml-2 rounded bg-slate-950 p-1 text-slate-100"
            disabled={wholePool || pending}
            value={target ?? ''}
            onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
          >
            <option value="">{t('admin.myShifts.swapColleague')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {`${member.givenName} ${member.familyName}`.trim() || member.email}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ?? localError ? (
        <p role="alert" className="mt-1 text-xs text-rose-400">{error ?? localError}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="text-sm text-slate-400 hover:text-slate-200"
          onClick={onClose}
        >
          {t('common:back')}
        </button>
        <button
          className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {t('admin.myShifts.swap')}
        </button>
      </div>
    </form>
  )
}

function MyShiftsPage() {
  const { t } = useTranslation('oncall')
  const me = useMe()
  const mayRead = usePermission('oncall.read')
  const mayConfirm = usePermission('oncall.confirm')
  const maySwap = usePermission('oncall.swap')
  const pools = useQuery({
    queryKey: ['oncall', 'pools'],
    queryFn: () => apiFetch<{ pools: { id: string; name: string }[] }>('/v1/oncall/pools'),
    retry: false,
  })

  if (me.isPending) {
    return <p className="mt-2 text-sm text-slate-400">{t('admin.loading')}</p>
  }

  if (me.isError || !me.data) {
    return (
      <p role="alert" className="mt-2 text-sm text-amber-300">{t('admin.sessionNotice')}</p>
    )
  }

  if (!mayRead) {
    return (
      <p role="alert" className="mt-2 text-sm text-amber-300">{t('admin.forbiddenNotice')}</p>
    )
  }

  if (pools.isError) {
    return (
      <p role="alert" className="mt-2 text-sm text-red-400">{t('admin.errors.unknown')}</p>
    )
  }

  return (
    <MyShiftsPageContent
      meUserId={me.data.user.id}
      pools={pools.data?.pools ?? []}
      mayConfirm={mayConfirm}
      maySwap={maySwap}
    />
  )
}

export { MyShiftsPage }
