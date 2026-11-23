import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  TICKET_PRIORITIES,
  type ObjectPriorityOverrideList,
  type TicketDefaults,
  type TicketPriority,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The standard values of the tickets (`specs/08-objects-api.md` §9.1, ADR-0029,
 * WP-M14-134g).
 *
 * The page shows the **standard** of the priority — the priority of a ticket
 * whose object follows the standard — and the list of the **deviations**: the
 * objects whose priority differs from it. The standard is written with
 * `PUT /api/v1/settings/ticket-defaults`; the write also deletes the deviations
 * that no longer deviate. Without `settings.write` the select stays read-only;
 * the server enforces the permission again.
 */

const jsonHeaders = { 'content-type': 'application/json' }
const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.defaults.errors.${code}`)
}

function useDefaults() {
  return useQuery({
    queryKey: ['ticket-defaults'],
    queryFn: () => apiFetch<TicketDefaults>('/v1/settings/ticket-defaults'),
    retry: false,
  })
}

function useOverrides() {
  return useQuery({
    queryKey: ['ticket-default-overrides'],
    queryFn: () => apiFetch<ObjectPriorityOverrideList>('/v1/settings/ticket-defaults/overrides'),
    retry: false,
  })
}

export function TicketDefaultsPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const queryClient = useQueryClient()

  const defaultsQuery = useDefaults()
  const overridesQuery = useOverrides()
  const [saved, setSaved] = useState(false)
  const [priority, setPriority] = useState<TicketPriority | null>(null)

  const standard = priority ?? defaultsQuery.data?.priority ?? 'normal'
  const overrides = overridesQuery.data?.overrides ?? []

  const save = useMutation({
    mutationFn: (body: TicketDefaults) =>
      apiFetch<TicketDefaults>('/v1/settings/ticket-defaults', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (savedDefaults) => {
      setPriority(savedDefaults.priority)
      setSaved(true)
      void queryClient.invalidateQueries({ queryKey: ['ticket-default-overrides'] })
    },
  })

  if (me.isPending) {
    return <p className="text-slate-400">{t('admin.defaults.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.defaults.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.defaults.forbiddenNotice')}
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('admin.defaults.title')}</h1>
        <p className="text-sm text-slate-400">{t('admin.defaults.hint')}</p>
      </div>

      {!canWrite ? (
        <p className="text-sm text-slate-400">{t('admin.defaults.readOnly')}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:max-w-xs">
        <label className="text-sm font-medium text-slate-200">
          {t('admin.defaults.standard')}
        </label>
        <select
          className="rounded bg-slate-900 p-2 text-slate-100"
          value={standard}
          disabled={!canWrite}
          onChange={(event) => {
            setSaved(false)
            setPriority(event.target.value as TicketPriority)
          }}
        >
          {TICKET_PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {t(`admin.defaults.priority.${option}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">{t('admin.defaults.standardHint')}</p>

        <div className="flex items-center gap-3">
          <button
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
            type="button"
            disabled={!canWrite || save.isPending}
            onClick={() => save.mutate({ priority: standard })}
          >
            {save.isPending ? t('admin.defaults.saving') : t('admin.defaults.save')}
          </button>
          {saved ? <span className="text-sm text-emerald-400">{t('admin.defaults.saved')}</span> : null}
        </div>

        {save.isError ? (
          <p role="alert" className="text-sm text-rose-400">
            {errorMessage(t, save.error)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('admin.defaults.deviations')}</h2>
        <p className="text-sm text-slate-400">{t('admin.defaults.deviationsHint')}</p>

        {overrides.length === 0 ? (
          <p className="text-sm text-slate-400">{t('admin.defaults.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-4">{t('admin.defaults.columns.objectNo')}</th>
                <th className="py-2 pr-4">{t('admin.defaults.columns.name')}</th>
                <th className="py-2">{t('admin.defaults.columns.priority')}</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => (
                <tr key={override.objectId} className="border-t border-slate-800">
                  <td className="py-2 pr-4">{override.objectNo}</td>
                  <td className="py-2 pr-4">{override.objectName}</td>
                  <td className="py-2">{t(`admin.defaults.priority.${override.priority}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
