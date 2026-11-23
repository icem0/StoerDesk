import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  DetectedErrorListResponse,
  DetectedErrorResponse,
  DetectedErrorUpdateRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { apiFetch } from '../lib/api'
import { languageRecord, localizedName } from '../lib/localized-name'
import { errorMessage, jsonHeaders } from './detected-error-form-parts'

/**
 * Festgestellte Fehler — Admin-Katalog (`specs/13-detected-errors.md` §13.5,
 * WP-M11-06).
 *
 * Liste (name, status, usage), Anlegen/Bearbeiten (key + beide Sprachen),
 * Archivieren/Reaktivieren, Löschen (blockiert bei Nutzung → `409
 * detected_error_in_use`). Geschützt mit `settings.read`/`settings.write`.
 *
 * Since WP-M16-17 the list follows the rule of `specs/13-ui.md` §14.8
 * (ADR-0043): the row shows **one** name — the name of the language of the
 * interface — and the actions of the row sit behind one `…` button. The key and
 * the texts of every language stand together in the edit.
 */

function useDetectedErrors() {
  return useQuery({
    queryKey: ['detected-errors'],
    queryFn: () => apiFetch<DetectedErrorListResponse>('/v1/detected-errors'),
    retry: false,
  })
}

function alphabetical(items: DetectedErrorResponse[]): DetectedErrorResponse[] {
  return [...items].sort((a, b) => a.key.localeCompare(b.key))
}

function EditErrorForm({
  item,
  onClose,
}: {
  item: DetectedErrorResponse
  onClose: () => void
}) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [key, setKey] = useState(item.key)
  const [labelDe, setLabelDe] = useState(item.labelDe)
  const [labelEn, setLabelEn] = useState(item.labelEn)

  const mutation = useMutation({
    mutationFn: (body: DetectedErrorUpdateRequest) =>
      apiFetch<DetectedErrorResponse>(`/v1/detected-errors/${item.key}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
      onClose()
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ key, labelDe, labelEn, archivedAt: item.archivedAt })
      }}
    >
      <h2 className="text-lg font-semibold">
        {t('detectedErrors.editTitle', { key: item.key })}
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.key')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
          type="text"
          required
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.de')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
          required
          value={labelDe}
          onChange={(event) => setLabelDe(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.en')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
          required
          value={labelEn}
          onChange={(event) => setLabelEn(event.target.value)}
        />
      </label>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('detectedErrors.save')}
        </button>
        <button
          className="rounded border border-slate-600 px-4 py-2 font-medium text-slate-300"
          type="button"
          onClick={onClose}
        >
          {t('detectedErrors.cancel')}
        </button>
      </div>
    </form>
  )
}

export function DetectedErrorsPage() {
  const { t, i18n } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editing, setEditing] = useState<DetectedErrorResponse | null>(null)
  const items = useDetectedErrors()
  const queryClient = useQueryClient()

  const archiveMutation = useMutation({
    mutationFn: (item: DetectedErrorResponse) =>
      apiFetch<DetectedErrorResponse>(`/v1/detected-errors/${item.key}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ archivedAt: item.archivedAt === null ? new Date().toISOString() : null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (item: DetectedErrorResponse) =>
      apiFetch(`/v1/detected-errors/${item.key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
    },
  })

  if (me.isPending) {
    return <p>{t('detectedErrors.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('detectedErrors.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('detectedErrors.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {t('detectedErrors.title')}
      </h1>
      <p className="mt-2 text-sm text-slate-400">{t('detectedErrors.hint')}</p>

      {items.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, items.error)}
        </p>
      ) : null}

      {deleteMutation.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, deleteMutation.error)}
        </p>
      ) : null}

      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          to="/admin/detected-errors/new"
        >
          {t('detectedErrors.createTitle')}
        </Link>
      ) : null}

      {canWrite && editing ? (
        <EditErrorForm item={editing} onClose={() => setEditing(null)} />
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th>{t('detectedErrors.table.name')}</th>
              <th>{t('detectedErrors.table.status')}</th>
              <th>{t('detectedErrors.table.usage')}</th>
              {canWrite ? <th>{t('detectedErrors.table.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {alphabetical(items.data?.detectedErrors ?? []).map((item) => {
              const blocked = item.archivedAt !== null

              return (
                <tr key={item.key} className="border-b border-slate-800 align-top">
                  <td className="py-2" title={item.key}>
                    {localizedName(
                      languageRecord({ de: item.labelDe, en: item.labelEn }),
                      i18n.language,
                      item.key,
                    )}
                  </td>
                  <td className="py-2">
                    {item.archivedAt === null
                      ? t('detectedErrors.active')
                      : t('detectedErrors.archived')}
                  </td>
                  <td className="py-2">—</td>
                  {canWrite ? (
                    <td className="py-2">
                      <RowMenu
                        items={[
                          {
                            key: 'edit',
                            label: t('detectedErrors.edit'),
                            onSelect: () => setEditing(item),
                          },
                          {
                            key: 'archive',
                            label:
                              item.archivedAt === null
                                ? t('detectedErrors.archive')
                                : t('detectedErrors.unarchive'),
                            onSelect: () => archiveMutation.mutate(item),
                          },
                          {
                            key: 'delete',
                            label: t('detectedErrors.delete'),
                            tone: 'danger',
                            disabled: blocked,
                            title: blocked ? t('detectedErrors.deleteBlocked') : undefined,
                            onSelect: () => deleteMutation.mutate(item),
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
      </div>
    </main>
  )
}
