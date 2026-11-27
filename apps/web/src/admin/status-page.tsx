import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ticketStatusInUseCode,
  ticketStatusKeyTakenCode,
  ticketStatusLastActiveCode,
  ticketStatusNotFoundCode,
  type TicketStatusCreateRequest,
  type TicketStatusListResponse,
  type TicketStatusResponse,
  type TicketStatusUpdateRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { HelpPopover } from '../components/help-popover'
import { helpTriggerClass } from '../components/help-trigger'
import { ApiError, apiFetch } from '../lib/api'
import { languageRecord, localizedName } from '../lib/localized-name'
import { StatusForm } from './status-form'
import { AdminLayout } from '../components/admin-layout'

/**
 * The status administration (WP-M14-37, `specs/07-escalation.md` §7.9 and
 * §7.1). The table is the `ticket_statuses` table of WP-M14-35: the name, the
 * colour, the position, the active switch, the terminal flag and the number of
 * tickets that carry the status. The form of WP-M14-37 creates and edits a
 * status, a delete only removes a status no ticket carries and never the last
 * active one — the API answers `409 status_in_use` and
 * `409 status_last_active` and the page names both (`specs/07-escalation.md`
 * §7.9). Without `settings.write` the editors stay read-only; the server
 * enforces the permission again.
 *
 * Since WP-M16-18 the list follows the rule of `specs/13-ui.md` §14.8
 * (ADR-0043): the row shows **one** name — the name of the language of the
 * interface — and the actions of the row sit behind one `…` button. The key and
 * the texts of every language stand together in the edit.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  ticketStatusNotFoundCode,
  ticketStatusKeyTakenCode,
  ticketStatusInUseCode,
  ticketStatusLastActiveCode,
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.status.errors.${code}`)
}

function useStatuses() {
  return useQuery({
    queryKey: ['ticket-statuses'],
    queryFn: () => apiFetch<TicketStatusListResponse>('/v1/admin/statuses'),
    retry: false,
  })
}

export function StatusPage() {
  const { t, i18n } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)

  const statuses = useStatuses()
  const queryClient = useQueryClient()
  const rows = statuses.data?.statuses ?? []
  const editing = rows.find((row) => row.key === editingKey)

  const writeStatus = useMutation({
    mutationFn: (request: {
      key: string | null
      body: TicketStatusCreateRequest | TicketStatusUpdateRequest
    }) =>
      apiFetch<TicketStatusResponse>(
        request.key === null ? '/v1/admin/statuses' : `/v1/admin/statuses/${request.key}`,
        {
          method: request.key === null ? 'POST' : 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify(request.body),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-statuses'] })
    },
  })

  const deleteStatus = useMutation({
    mutationFn: (key: string) => apiFetch<void>(`/v1/admin/statuses/${key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket-statuses'] })
    },
  })

  if (me.isPending) {
    return <p>{t('admin.status.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.status.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.status.forbiddenNotice')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.status.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.status.hint')}</p>
      {!canWrite ? (
        <p className="mt-2 text-sm text-amber-300">{t('admin.status.readOnly')}</p>
      ) : null}
      {statuses.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, statuses.error)}
        </p>
      ) : null}
      {writeStatus.isError || deleteStatus.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, writeStatus.isError ? writeStatus.error : deleteStatus.error)}
        </p>
      ) : null}
      {writeStatus.isSuccess ? (
        <p className="mt-2 text-sm text-emerald-300">{t('admin.status.saved')}</p>
      ) : null}
      {deleteStatus.isSuccess ? (
        <p className="mt-2 text-sm text-emerald-300">{t('admin.status.deleted')}</p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.status.table.name')}</th>
            <th>{t('admin.status.table.color')}</th>
            <th>{t('admin.status.table.position')}</th>
            <th>{t('admin.status.table.active')}</th>
            <th>{t('admin.status.table.terminal')}</th>
            <th>{t('admin.status.table.tickets')}</th>
            {canWrite ? <th>{t('admin.status.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = localizedName(
              languageRecord({ de: row.nameDe, en: row.nameEn }),
              i18n.language,
              row.key,
            )

            return (
              <tr key={row.key} className="border-b border-slate-800">
                <td className="py-2">
                  {name}
                  <HelpPopover
                    className={helpTriggerClass}
                    label={t('help:triggerFor', { name })}
                    text={t('help:statuses.keyMore', { key: row.key })}
                  />
                </td>
                <td>
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-slate-600"
                    style={{ backgroundColor: row.color }}
                  >
                    {row.color}
                  </span>
                </td>
                <td>{row.position}</td>
                <td>{row.active ? t('admin.status.on') : t('admin.status.off')}</td>
                <td>
                  {row.isTerminal ? t('admin.status.terminalYes') : t('admin.status.terminalNo')}
                </td>
                <td>{row.ticketCount}</td>
                {canWrite ? (
                  <td>
                    <RowMenu
                      items={[
                        {
                          key: 'edit',
                          label: t('admin.status.edit'),
                          onSelect: () => setEditingKey(editingKey === row.key ? null : row.key),
                        },
                        {
                          key: 'delete',
                          label: t('admin.status.delete'),
                          tone: 'danger',
                          onSelect: () => setRemoveCandidate(row.key),
                        },
                      ]}
                    />
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
      {removeCandidate !== null ? (
        <div
          className="mt-4 rounded border border-rose-500/60 bg-rose-950/20 p-3 text-sm text-rose-200"
          role="alertdialog"
        >
          <p>{t('admin.status.removeHint', { key: removeCandidate })}</p>
          <div className="mt-2 flex gap-2">
            <button
              className="min-h-11 rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
              onClick={() => {
                void deleteStatus.mutate(removeCandidate)
                setRemoveCandidate(null)
              }}
              type="button"
            >
              {t('admin.status.removeConfirm')}
            </button>
            <button
              className="min-h-11 rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
              onClick={() => setRemoveCandidate(null)}
              type="button"
            >
              {t('admin.status.removeCancel')}
            </button>
          </div>
        </div>
      ) : null}
      {editing ? (
        <StatusForm
          status={editing}
          canWrite={canWrite}
          onSave={(body) => void writeStatus.mutate({ key: editing.key, body })}
        />
      ) : null}
      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          to="/admin/statuses/new"
        >
          {t('admin.status.createTitle')}
        </Link>
      ) : null}
    </AdminLayout>
  )
}
