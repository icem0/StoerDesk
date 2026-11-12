import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  BMA_API_KEY_MAX_LENGTH,
  type BmaCredentialsResponse,
  type BmaSyncRunRow,
  type BmaSyncRunSummary,
  type BmaSyncRunsResponse,
  type BmaSyncSchedule,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * BMAcloud sync page (`specs/17-bmacloud-sync.md` §17.5, WP-M2-37, WP-M2-47).
 *
 * The office sees the run history of the read-only object pull, the conflicts of the
 * newest run and triggers a manual pull with "Jetzt abgleichen". The schedule pair is
 * read from `GET /api/v1/admin/bma-sync/schedule` (WP-M2-36b), so the form prefills
 * what the pg-boss job of WP-M2-36 really schedules — the stored `settings` rows with
 * the `BMA_SYNC_*` environment as fallback. The bearer key is write-only (ADR-0005):
 * the credentials card shows only `{ configured, source }` from
 * `GET /api/v1/admin/bma-sync/credentials`, stores a typed key with `PUT` and removes
 * the stored row with `DELETE`; nothing ever refills the field, because the API never
 * answers the key. The server guards (`object.read`, `object.import`, `object.write`)
 * are the only enforcement point; the UI only hides what the role may not do.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'bma_not_configured',
  'bma_request_failed',
  'bma_bad_response',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

const STATUS_STYLES: Record<string, string> = {
  RUNNING: 'bg-sky-900/30 text-sky-300',
  SUCCESS: 'bg-emerald-900/30 text-emerald-300',
  PARTIAL: 'bg-amber-900/30 text-amber-300',
  FAILED: 'bg-rose-900/30 text-rose-300',
}

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.bma.errors.${code}`)
}

function useBmaSyncRuns() {
  return useQuery({
    queryKey: ['bma-sync', 'runs'],
    queryFn: () => apiFetch<BmaSyncRunsResponse>('/v1/admin/bma-sync/runs'),
    retry: false,
  })
}

function useBmaSyncSchedule() {
  return useQuery({
    queryKey: ['bma-sync', 'schedule'],
    queryFn: () => apiFetch<BmaSyncSchedule>('/v1/admin/bma-sync/schedule'),
    retry: false,
  })
}

function useBmaCredentials() {
  return useQuery({
    queryKey: ['bma-sync', 'credentials'],
    queryFn: () => apiFetch<BmaCredentialsResponse>('/v1/admin/bma-sync/credentials'),
    retry: false,
  })
}

/** Source line of the credentials card — the key itself is never fetched (ADR-0005). */
const CREDENTIAL_SOURCE_KEYS = {
  db: 'admin.bma.credentialsSourceDb',
  env: 'admin.bma.credentialsSourceEnv',
  none: 'admin.bma.credentialsSourceNone',
} as const

function CredentialsCard({
  credentials,
  canWrite,
}: {
  credentials: BmaCredentialsResponse
  canWrite: boolean
}) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [feedback, setFeedback] = useState<'saved' | 'removed' | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['bma-sync', 'credentials'] })
    void queryClient.invalidateQueries({ queryKey: ['bma-sync'] })
  }

  const store = useMutation({
    mutationFn: () =>
      apiFetch<BmaCredentialsResponse>('/v1/admin/bma-sync/credentials', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => {
      setApiKey('')
      setFeedback('saved')
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: () =>
      apiFetch<BmaCredentialsResponse>('/v1/admin/bma-sync/credentials', { method: 'DELETE' }),
    onSuccess: () => {
      setFeedback('removed')
      invalidate()
    },
  })

  const mutationError = store.error ?? remove.error

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setFeedback(null)
        store.mutate()
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.bma.credentialsTitle')}</h2>
      <p className="text-sm text-slate-400">{t(CREDENTIAL_SOURCE_KEYS[credentials.source])}</p>
      <p className="text-sm text-slate-400">{t('admin.bma.credentialsHint')}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.bma.credentialsLabel')}
        <input
          type="password"
          autoComplete="off"
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={BMA_API_KEY_MAX_LENGTH}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          disabled={!canWrite}
        />
      </label>
      {mutationError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutationError)}
        </p>
      ) : null}
      {feedback ? (
        <p className="text-sm text-emerald-400">
          {feedback === 'saved'
            ? t('admin.bma.credentialsSaved')
            : t('admin.bma.credentialsRemoved')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={!canWrite || store.isPending || apiKey.trim() === ''}
        >
          {t('admin.bma.credentialsSave')}
        </button>
        {credentials.source === 'db' ? (
          <button
            className="rounded border border-slate-600 px-4 py-2 font-medium text-slate-200 disabled:opacity-50"
            type="button"
            disabled={!canWrite || remove.isPending}
            onClick={() => {
              setFeedback(null)
              remove.mutate()
            }}
          >
            {t('admin.bma.credentialsRemove')}
          </button>
        ) : null}
      </div>
    </form>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('settings')

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? 'bg-slate-800 text-slate-300'
      }`}
    >
      {t(`admin.bma.status.${status}`)}
    </span>
  )
}

function ScheduleForm({
  schedule,
  canWrite,
  onSaved,
}: {
  schedule: BmaSyncSchedule
  canWrite: boolean
  onSaved: () => void
}) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState(schedule)

  const mutation = useMutation({
    mutationFn: (body: BmaSyncSchedule) =>
      apiFetch<BmaSyncSchedule>('/v1/admin/bma-sync/schedule', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bma-sync', 'schedule'] })
      onSaved()
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate(values)
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.bma.scheduleTitle')}</h2>
      <p className="text-sm text-slate-400">{t('admin.bma.scheduleHint')}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) => setValues({ ...values, enabled: event.target.checked })}
          disabled={!canWrite}
        />
        {t('admin.bma.enabled')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.bma.cron')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={64}
          value={values.cron}
          onChange={(event) => setValues({ ...values, cron: event.target.value })}
          disabled={!canWrite}
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
        disabled={!canWrite || mutation.isPending}
      >
        {t('admin.bma.save')}
      </button>
    </form>
  )
}

function RunTable({ runs, locale }: { runs: BmaSyncRunRow[]; locale: string }) {
  const { t } = useTranslation('settings')
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.bma.table.started')}</th>
            <th>{t('admin.bma.table.finished')}</th>
            <th>{t('admin.bma.table.status')}</th>
            <th>{t('admin.bma.table.total')}</th>
            <th>{t('admin.bma.table.created')}</th>
            <th>{t('admin.bma.table.updated')}</th>
            <th>{t('admin.bma.table.unchanged')}</th>
            <th>{t('admin.bma.table.deactivated')}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-slate-800 align-top">
              <td className="py-2">{format(run.startedAt)}</td>
              <td className="py-2">
                {run.finishedAt === null ? t('admin.bma.notFinished') : format(run.finishedAt)}
              </td>
              <td className="py-2">
                <StatusBadge status={run.status} />
              </td>
              <td className="py-2">{run.total}</td>
              <td className="py-2">{run.created}</td>
              <td className="py-2">{run.updated}</td>
              <td className="py-2">{run.unchanged}</td>
              <td className="py-2">{run.deactivated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConflictTable({ conflicts }: { conflicts: BmaSyncRunSummary['conflicts'] }) {
  const { t } = useTranslation('settings')

  if (conflicts.length === 0) {
    return <p className="mt-2 text-sm text-slate-400">{t('admin.bma.noConflicts')}</p>
  }

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.bma.conflicts.code')}</th>
            <th>{t('admin.bma.conflicts.objectNo')}</th>
            <th>{t('admin.bma.conflicts.aid')}</th>
            <th>{t('admin.bma.conflicts.detail')}</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map((conflict) => (
            <tr
              key={`${conflict.aid}-${conflict.objectNo}-${conflict.code}`}
              className="border-b border-slate-800 align-top"
            >
              <td className="py-2 font-mono text-xs text-slate-300">{conflict.code}</td>
              <td className="py-2">{conflict.objectNo}</td>
              <td className="py-2 font-mono text-xs text-slate-400">{conflict.aid}</td>
              <td className="py-2 text-slate-400">{conflict.detail ?? t('admin.bma.noDetail')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BmaSyncPage() {
  const { t, i18n } = useTranslation('settings')
  const me = useMe()
  const mayRead = usePermission('object.read')
  const mayImport = usePermission('object.import')
  const mayWrite = usePermission('object.write')
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const runs = useBmaSyncRuns()
  const schedule = useBmaSyncSchedule()
  const credentials = useBmaCredentials()

  const trigger = useMutation({
    mutationFn: () => apiFetch<BmaSyncRunSummary>('/v1/admin/bma-sync/run', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bma-sync'] })
    },
  })

  if (me.isPending) {
    return <p>{t('admin.bma.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.bma.sessionNotice')}
      </p>
    )
  }

  if (!mayRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.bma.forbiddenNotice')}
      </p>
    )
  }

  const newestRuns = runs.data?.runs ?? []

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.bma.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.bma.hint')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={!mayImport || trigger.isPending}
          onClick={() => trigger.mutate()}
        >
          {trigger.isPending ? t('admin.bma.running') : t('admin.bma.runNow')}
        </button>
        {trigger.isError ? (
          <span role="alert" className="text-sm text-red-400">
            {errorMessage(t, trigger.error)}
          </span>
        ) : null}
      </div>

      {credentials.data ? (
        <CredentialsCard credentials={credentials.data} canWrite={mayImport} />
      ) : null}

      {schedule.data ? (
        <ScheduleForm schedule={schedule.data} canWrite={mayWrite} onSaved={() => setSaved(true)} />
      ) : null}

      {schedule.isError || runs.isError || credentials.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, schedule.error ?? runs.error ?? credentials.error)}
        </p>
      ) : null}

      {saved ? <p className="mt-2 text-sm text-emerald-400">{t('admin.bma.saved')}</p> : null}

      <h2 className="mt-6 text-lg font-semibold">{t('admin.bma.runsTitle')}</h2>

      {runs.isPending ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.bma.loading')}</p>
      ) : newestRuns.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t('admin.bma.noRuns')}</p>
      ) : (
        <>
          <RunTable runs={newestRuns} locale={i18n.language} />
          <h2 className="mt-6 text-lg font-semibold">{t('admin.bma.conflictsTitle')}</h2>
          <ConflictTable conflicts={newestRuns[0]?.conflicts ?? []} />
        </>
      )}
    </main>
  )
}
