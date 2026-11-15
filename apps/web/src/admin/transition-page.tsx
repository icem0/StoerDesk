import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ticketStatusKeySchema,
  ticketTransitionEventKeySchema,
  ticketTransitionNotFoundCode,
  type TicketTransition,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The transition administration (WP-M14-39b, `specs/07-escalation.md` §7.13,
 * ADR-0025). The table is the `ticket_transitions` table of WP-M14-38a: one row
 * per workflow step — the step from `from_status` to `to_status` that the event
 * `event_key` performs, its `active` switch and its row identity. `settings.read`
 * reads, `settings.write` (WP-M14-39) creates, edits and deletes a step: an
 * unknown `id` answers `404 transition_not_found`, a status key that names no
 * row of `ticket_statuses` answers `400 invalid_status_key` and a step that
 * duplicates the unique `(from_status, event_key)` pair of migration `0041`
 * answers `409 transition_duplicate` — the page names all three. ADR-0025 keeps
 * the trade-off of an empty workflow visible: without rows no ticket can change
 * its status any more. `condition` is stored by the API of WP-M14-39 but
 * evaluated only by WP-M14-41, so the page never edits or explains it.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'invalid_status_key',
  ticketTransitionNotFoundCode,
  'transition_duplicate',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

type TransitionWriteBody = {
  fromStatus: string
  toStatus: string
  eventKey: string
  active: boolean
}

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.transition.errors.${code}`)
}

function useTransitions() {
  return useQuery({
    queryKey: ['ticket-transitions'],
    queryFn: () => apiFetch<{ transitions: TicketTransition[] }>('/v1/admin/transitions'),
    retry: false,
  })
}

export function TransitionPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)

  const transitions = useTransitions()
  const queryClient = useQueryClient()
  const rows = transitions.data?.transitions ?? []
  const editing = rows.find((row) => row.id === editingId)

  const writeTransition = useMutation({
    mutationFn: (request: { id: string | null; body: TransitionWriteBody }) =>
      apiFetch<TicketTransition>(
        request.id === null
          ? '/v1/admin/transitions'
          : `/v1/admin/transitions/${request.id}`,
        {
          method: request.id === null ? 'POST' : 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify(request.body),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-transitions'] })
    },
  })

  const deleteTransition = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/admin/transitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-transitions'] })
    },
  })

  if (me.isPending) {
    return <p>{t('admin.transition.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.transition.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.transition.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.transition.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.transition.hint')}</p>
      {!canWrite ? <p className="mt-2 text-sm text-amber-300">{t('admin.transition.readOnly')}</p> : null}
      {transitions.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, transitions.error)}
        </p>
      ) : null}
      {writeTransition.isError || deleteTransition.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, writeTransition.isError ? writeTransition.error : deleteTransition.error)}
        </p>
      ) : null}
      {writeTransition.isSuccess ? (
        <p className="mt-2 text-sm text-emerald-300">{t('admin.transition.saved')}</p>
      ) : null}
      {deleteTransition.isSuccess ? (
        <p className="mt-2 text-sm text-emerald-300">{t('admin.transition.deleted')}</p>
      ) : null}
      {transitions.isSuccess && rows.length === 0 ? (
        <p role="alert" className="mt-2 text-sm text-amber-300">
          {t('admin.transition.emptyNotice')}
        </p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.transition.table.id')}</th>
            <th>{t('admin.transition.table.from')}</th>
            <th>{t('admin.transition.table.to')}</th>
            <th>{t('admin.transition.table.event')}</th>
            <th>{t('admin.transition.table.active')}</th>
            {canWrite ? <th>{t('admin.transition.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800">
              <td>{row.id}</td>
              <td>{row.fromStatus}</td>
              <td>{row.toStatus}</td>
              <td>{row.eventKey}</td>
              <td>{row.active ? t('admin.transition.on') : t('admin.transition.off')}</td>
              {canWrite ? (
                <td>
                  <div className="flex gap-2">
                    <button
                      className="rounded border border-slate-600 px-2 py-1 text-xs"
                      type="button"
                      onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                    >
                      {t('admin.transition.edit')}
                    </button>
                    <button
                      className="rounded border border-rose-600 px-2 py-1 text-xs text-rose-300"
                      type="button"
                      onClick={() => setRemoveCandidate(row.id)}
                    >
                      {t('admin.transition.delete')}
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {removeCandidate !== null ? (
        <TransitionRemoveDialog
          row={rows.find((row) => row.id === removeCandidate)}
          t={t}
          canWrite={canWrite}
          onConfirm={() => void deleteTransition.mutate(removeCandidate)}
          onCancel={() => setRemoveCandidate(null)}
        />
      ) : null}
      {editing ? (
        <TransitionForm
          transition={editing}
          canWrite={canWrite}
          onSave={(body) => void writeTransition.mutate({ id: editing.id, body })}
        />
      ) : null}
      {canWrite ? (
        <TransitionForm
          transition={null}
          canWrite
          onSave={(body) => void writeTransition.mutate({ id: null, body })}
        />
      ) : null}
    </main>
  )
}

function TransitionRemoveDialog({
  row,
  t,
  canWrite,
  onConfirm,
  onCancel,
}: {
  row: TicketTransition | undefined
  t: TFunction<'settings'>
  canWrite: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="mt-4 rounded border border-rose-500/60 bg-rose-950/20 p-3 text-sm text-rose-200"
      role="alertdialog"
    >
      <p>
        {row === undefined
          ? t('admin.transition.removeUnknown')
          : t('admin.transition.removeHint', { from: row.fromStatus, event: row.eventKey })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          className="min-h-11 rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
          onClick={canWrite ? onConfirm : onCancel}
          type="button"
        >
          {t('admin.transition.removeConfirm')}
        </button>
        <button
          className="min-h-11 rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
          onClick={onCancel}
          type="button"
        >
          {t('admin.transition.removeCancel')}
        </button>
      </div>
    </div>
  )
}

function TransitionForm({
  transition,
  canWrite,
  onSave,
}: {
  transition: TicketTransition | null
  canWrite: boolean
  onSave: (body: TransitionWriteBody) => void
}) {
  const { t } = useTranslation('settings')
  const [values, setValues] = useState({
    fromStatus: transition?.fromStatus ?? '',
    toStatus: transition?.toStatus ?? '',
    eventKey: transition?.eventKey ?? '',
    active: transition?.active ?? true,
  })
  const [attempted, setAttempted] = useState(false)

  const body: TransitionWriteBody = {
    fromStatus: values.fromStatus,
    toStatus: values.toStatus,
    eventKey: values.eventKey,
    active: values.active,
  }

  const valid =
    ticketStatusKeySchema.safeParse(body.fromStatus).success &&
    ticketStatusKeySchema.safeParse(body.toStatus).success &&
    ticketTransitionEventKeySchema.safeParse(body.eventKey).success

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      data-testid="transition-form"
      onSubmit={(event) => {
        event.preventDefault()

        if (valid) {
          onSave(body)
        } else {
          setAttempted(true)
        }
      }}
    >
      <h2 className="text-lg font-semibold">
        {transition === null
          ? t('admin.transition.createTitle')
          : t('admin.transition.editTitle', { id: transition.id })}
      </h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          {t('admin.transition.fields.fromStatus')}
          <input
            className="w-24 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.fromStatus}
            onChange={(event) =>
              setValues((current) => ({ ...current, fromStatus: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.transition.fields.toStatus')}
          <input
            className="w-24 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.toStatus}
            onChange={(event) =>
              setValues((current) => ({ ...current, toStatus: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.transition.fields.eventKey')}
          <input
            className="w-32 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            type="text"
            value={values.eventKey}
            onChange={(event) =>
              setValues((current) => ({ ...current, eventKey: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.transition.fields.active')}
          <input
            className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            checked={values.active}
            disabled={!canWrite}
            type="checkbox"
            onChange={(event) =>
              setValues((current) => ({ ...current, active: event.target.checked }))
            }
          />
        </label>
      </div>

      {attempted && !valid ? (
        <p role="alert" className="text-sm text-red-400">
          {t('admin.transition.errors.invalid_request')}
        </p>
      ) : null}

      <button
        className="min-h-11 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        disabled={values.fromStatus === '' || values.toStatus === '' || values.eventKey === ''}
        type="submit"
      >
        {transition === null ? t('admin.transition.create') : t('admin.transition.save')}
      </button>
    </form>
  )
}
