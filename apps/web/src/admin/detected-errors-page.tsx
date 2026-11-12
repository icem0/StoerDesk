import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import type {
  DetectedErrorCreateRequest,
  DetectedErrorListResponse,
  DetectedErrorResponse,
  DetectedErrorUpdateRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Festgestellte Fehler — Admin-Katalog (`specs/13-detected-errors.md` §13.5,
 * WP-M11-06).
 *
 * Liste (key, de, en, status, usage), Anlegen/Bearbeiten (key + beide Sprachen),
 * Archivieren/Reaktivieren, Löschen (blockiert bei Nutzung → `409
 * detected_error_in_use`). Geschützt mit `settings.read`/`settings.write`.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'detected_error_not_found',
  'detected_error_in_use',
  'detected_error_key_taken',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`detectedErrors.errors.${code}`)
}

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

function CreateErrorForm() {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [key, setKey] = useState('')
  const [labelDe, setLabelDe] = useState('')
  const [labelEn, setLabelEn] = useState('')

  const mutation = useMutation({
    mutationFn: (body: DetectedErrorCreateRequest) =>
      apiFetch<DetectedErrorResponse>('/v1/detected-errors', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
      setKey('')
      setLabelDe('')
      setLabelEn('')
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ key, labelDe, labelEn })
      }}
    >
      <h2 className="text-lg font-semibold">{t('detectedErrors.createTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.key')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
          type="text"
          required
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.de')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
          required
          value={labelDe}
          onChange={(event) => setLabelDe(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.en')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
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
      <button
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={mutation.isPending}
      >
        {t('detectedErrors.create')}
      </button>
    </form>
  )
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
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
          type="text"
          required
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.de')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
          required
          value={labelDe}
          onChange={(event) => setLabelDe(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('detectedErrors.fields.en')}
        <input
          className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/30"
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
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
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

function ArchiveButton({ item }: { item: DetectedErrorResponse }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetch<DetectedErrorResponse>(`/v1/detected-errors/${item.key}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ archivedAt: archived ? new Date().toISOString() : null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
    },
  })

  return (
    <button
      className="rounded border border-slate-600 px-2 py-1 text-xs"
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(item.archivedAt === null)}
    >
      {item.archivedAt === null
        ? t('detectedErrors.archive')
        : t('detectedErrors.unarchive')}
    </button>
  )
}

function DeleteButton({ item }: { item: DetectedErrorResponse }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/v1/detected-errors/${item.key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
    },
  })

  const blocked = item.archivedAt !== null

  return (
    <div className="flex flex-col gap-1">
      <button
        className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 disabled:opacity-40"
        type="button"
        disabled={blocked || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('detectedErrors.delete')}
      </button>
      {blocked ? (
        <span className="text-xs text-slate-500">
          {t('detectedErrors.deleteBlocked')}
        </span>
      ) : null}
      {mutation.isError ? (
        <span role="alert" className="text-xs text-red-400">
          {errorMessage(t, mutation.error)}
        </span>
      ) : null}
    </div>
  )
}

export function DetectedErrorsPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editing, setEditing] = useState<DetectedErrorResponse | null>(null)
  const items = useDetectedErrors()

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
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {t('detectedErrors.title')}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('detectedErrors.hint')}
      </p>

      {items.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, items.error)}
        </p>
      ) : null}

      {canWrite ? (
        editing === null ? (
          <CreateErrorForm />
        ) : (
          <EditErrorForm item={editing} onClose={() => setEditing(null)} />
        )
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th>{t('detectedErrors.table.key')}</th>
              <th>{t('detectedErrors.table.de')}</th>
              <th>{t('detectedErrors.table.en')}</th>
              <th>{t('detectedErrors.table.status')}</th>
              <th>{t('detectedErrors.table.usage')}</th>
              {canWrite ? <th>{t('detectedErrors.table.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {alphabetical(items.data?.detectedErrors ?? []).map((item) => (
              <tr key={item.key} className="border-b border-slate-800 align-top">
                <td className="py-2 font-mono text-xs text-slate-400">{item.key}</td>
                <td className="py-2">{item.labelDe}</td>
                <td className="py-2">{item.labelEn}</td>
                <td className="py-2">
                  {item.archivedAt === null
                    ? t('detectedErrors.active')
                    : t('detectedErrors.archived')}
                </td>
                <td className="py-2">—</td>
                {canWrite ? (
                  <td className="py-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <button
                        className="rounded border border-slate-600 px-2 py-1 text-xs"
                        type="button"
                        onClick={() => setEditing(item)}
                      >
                        {t('detectedErrors.edit')}
                      </button>
                      <ArchiveButton item={item} />
                      <DeleteButton item={item} />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
