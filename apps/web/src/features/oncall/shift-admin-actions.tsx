import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { OnCallShift } from '@stoerdesk/shared'

import { usePermission } from '../../auth/usePermission'
import { ApiError, apiFetch } from '../../lib/api'

/**
 * The actions of the admin for one shift (`specs/04-oncall.md` §4a.3, WP-M23-06).
 *
 * The dialog of a shift showed the state, the pool, the period and the history
 * — and no action at all, so the admin who opens a shift nobody accepted found
 * nothing to do there. This component carries the three actions of the plan:
 * assign a technician of the pool, publish a draft and delete the shift.
 *
 * The component renders nothing without the permission `oncall.admin`; the
 * server guards the writes anyway (`PATCH` and `DELETE /api/v1/oncall/shifts/:id`),
 * the interface only shows what the role may do. The candidates of the
 * assignment come from the members of the pool (`oncall.read`), so the admin
 * needs no right beyond the readiness itself.
 */

type PoolMember = {
  id: string
  givenName: string
  familyName: string
  email: string
}

function memberName(member: PoolMember): string {
  const name = `${member.givenName} ${member.familyName}`.trim()

  return name === '' ? member.email : name
}

/** The reason of a refused delete (`ADR-0047`). */
function lockedReason(error: unknown): string {
  if (error instanceof ApiError && error.code === 'oncall_shift_locked') {
    const reason = error.params?.reason

    if (reason === 'confirmed') {
      return 'confirmed'
    }

    if (reason === 'started') {
      return 'started'
    }

    return 'state'
  }

  return 'unknown'
}

export function ShiftAdminActions(props: {
  shift: OnCallShift
  /** Called after an action, so the page reads the plan again. */
  onChanged?: () => void
}) {
  const { t } = useTranslation('oncall')
  const queryClient = useQueryClient()
  const mayAdmin = usePermission('oncall.admin')
  const [technicianId, setTechnicianId] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Every action reads the plan again: the calendar, the weekly plan and the
  // own shifts of the page all live under the key `oncall`.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['oncall'] })
    props.onChanged?.()
  }

  const members = useQuery({
    queryKey: ['oncall', 'members', props.shift.poolId],
    queryFn: () =>
      apiFetch<{ members: PoolMember[] }>(
        `/v1/oncall/pools/${props.shift.poolId}/members`,
      ),
    retry: false,
    enabled: mayAdmin,
  })

  const assign = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<OnCallShift>(`/v1/oncall/shifts/${props.shift.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        // The shift is published again: the new technician has to accept it.
        body: JSON.stringify({ userId, publish: true }),
      }),
    onSuccess: () => {
      setError(null)
      setTechnicianId('')
      refresh()
    },
    onError: (cause) => {
      setError(errorText(cause))
    },
  })

  const publish = useMutation({
    mutationFn: () =>
      apiFetch<OnCallShift>(`/v1/oncall/shifts/${props.shift.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      }),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause) => {
      setError(errorText(cause))
    },
  })

  const remove = useMutation({
    mutationFn: () =>
      apiFetch<void>(`/v1/oncall/shifts/${props.shift.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setError(null)
      setConfirmingDelete(false)
      refresh()
    },
    onError: (cause) => {
      setError(errorText(cause))
    },
  })

  if (!mayAdmin) {
    return null
  }

  const candidates = members.data?.members ?? []
  const busy = assign.isPending || publish.isPending || remove.isPending
  // A confirmed or swapped shift is locked for the delete, always.
  const locked = props.shift.state === 'CONFIRMED' || props.shift.state === 'SWAP_REQUESTED'

  return (
    <div className="mt-4 rounded border border-slate-700 bg-slate-950/40 p-3">
      <h3 className="text-sm font-semibold text-slate-200">
        {t('admin.shiftDetail.adminActions')}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-400">{t('admin.shiftDetail.assign')}</span>
          <select
            aria-label={t('admin.shiftDetail.assign')}
            className="rounded bg-slate-900 p-1 text-slate-100"
            disabled={busy || candidates.length === 0}
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
          >
            <option value="">{t('admin.shiftDetail.unassigned')}</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {memberName(member)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded bg-accent-600 px-3 py-1 text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          disabled={busy || technicianId === ''}
          onClick={() => assign.mutate(technicianId)}
          type="button"
        >
          {t('admin.shiftDetail.assignAction')}
        </button>
        {props.shift.state === 'DRAFT' ? (
          <button
            className="rounded bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
            disabled={busy}
            onClick={() => publish.mutate()}
            type="button"
          >
            {t('admin.grid.publish')}
          </button>
        ) : null}
        {confirmingDelete ? (
          <span className="flex items-center gap-2">
            <button
              className="rounded bg-rose-700 px-3 py-1 text-white hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
              disabled={busy}
              onClick={() => remove.mutate()}
              type="button"
            >
              {t('admin.shiftDetail.deleteConfirm')}
            </button>
            <button
              className="rounded border border-slate-600 px-3 py-1 text-slate-300 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              {t('admin.shiftDetail.cancel')}
            </button>
          </span>
        ) : (
          <button
            className="rounded border border-rose-800 px-3 py-1 text-rose-300 hover:border-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
            disabled={busy || locked}
            title={locked ? t('admin.shiftDetail.deleteLocked') : undefined}
            onClick={() => setConfirmingDelete(true)}
            type="button"
          >
            {t('admin.grid.delete')}
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )

  function errorText(cause: unknown): string {
    if (cause instanceof ApiError && cause.code === 'oncall_shift_locked') {
      const reason = lockedReason(cause)

      if (reason === 'confirmed') {
        return t('admin.shiftDetail.lockedConfirmed')
      }

      if (reason === 'started') {
        return t('admin.shiftDetail.lockedStarted')
      }

      return t('admin.shiftDetail.lockedState')
    }

    if (cause instanceof ApiError && cause.code === 'oncall_shift_invalid_transition') {
      return t('admin.shiftDetail.lockedTransition')
    }

    return t('admin.errors.unknown')
  }
}
