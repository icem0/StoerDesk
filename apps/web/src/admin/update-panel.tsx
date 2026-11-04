import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { UpdateCheckResponse } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../lib/api'
import { appVersion } from '../lib/version'

/**
 * The update menu of the administration (`specs/18-self-update.md` §18.2,
 * ADR-0007).
 *
 * The panel reads `GET /api/v1/admin/update/check` and starts an update with
 * `POST /api/v1/admin/update/start`. The start is confirmed explicitly — a
 * confirm step, never a password — and the panel states that the stack
 * restarts itself and is briefly unreachable.
 *
 * The panel is shown to a user with the permission `system.update` only; the
 * guard of the server stays the only enforcement point (§3.2).
 */

const HANDLED_ERROR_CODES = [
  'session_invalid',
  'forbidden',
  'update_not_configured',
  'update_check_failed',
  'update_github_rate_limited',
  'update_no_update_available',
  'update_webhook_not_configured',
  'update_webhook_failed',
  'update_rate_limited',
] as const

/**
 * The text of a failed start.
 *
 * Three cases are told apart: the API answered with a known code, the API
 * answered with something unknown (its status is named, so a failure of the
 * API stays visible), and **no answer arrived at all**. The last case is the
 * normal one of a deployment that replaces the API container: the webhook
 * starts the rebuild and the connection dies with the old container — the
 * update has probably started.
 */
function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  if (!(error instanceof ApiError)) {
    return t('admin.update.errors.connection')
  }

  if (error.code !== undefined && (HANDLED_ERROR_CODES as readonly string[]).includes(error.code)) {
    return t(`admin.update.errors.${error.code}`)
  }

  return t('admin.update.errors.http', { status: error.status })
}

/** The text of a failed check: the API or GitHub did not answer. */
function checkErrorMessage(t: TFunction<'settings'>, error: unknown): string {
  if (
    error instanceof ApiError &&
    error.code !== undefined &&
    (HANDLED_ERROR_CODES as readonly string[]).includes(error.code)
  ) {
    return t(`admin.update.errors.${error.code}`)
  }

  return t('admin.update.errors.checkFailed')
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function UpdatePanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation('settings')
  const [confirming, setConfirming] = useState(false)

  const check = useQuery({
    queryKey: ['admin', 'update', 'check'],
    queryFn: () => apiFetch<UpdateCheckResponse>('/v1/admin/update/check'),
    // The API caches the answer for a minute, the panel does not ask again
    // before that.
    staleTime: 60_000,
    retry: false,
  })

  const start = useMutation({
    mutationFn: () => apiFetch<{ started: boolean }>('/v1/admin/update/start', { method: 'POST' }),
    onSuccess: () => setConfirming(false),
  })

  const data = check.data
  const started = start.isSuccess

  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('admin.update.title')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('admin.update.hint')}</p>
        </div>
        <button
          aria-label={t('admin.update.close')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto p-4 text-sm">
        <dl className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-slate-400">{t('admin.update.installedVersion')}</dt>
            <dd className="font-mono">{appVersion}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-slate-400">{t('admin.update.installedCommit')}</dt>
            <dd className="font-mono">{data?.current ?? t('admin.update.unknown')}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-slate-400">{t('admin.update.latestCommit')}</dt>
            <dd className="font-mono">{data?.latest ?? t('admin.update.unknown')}</dd>
          </div>
        </dl>

        {check.isPending ? (
          <p className="mt-3 text-slate-400">{t('admin.update.checking')}</p>
        ) : null}

        {check.isError ? (
          <p role="alert" className="mt-3 text-amber-300">
            {checkErrorMessage(t, check.error)}
          </p>
        ) : null}

        {data !== undefined ? (
          data.updateAvailable ? (
            <p className="mt-3 text-emerald-300">
              {t('admin.update.available', { count: data.commitsBehind ?? 0 })}
            </p>
          ) : data.commitsBehind === 0 ? (
            <p className="mt-3 text-emerald-300">{t('admin.update.upToDate')}</p>
          ) : (
            <p className="mt-3 text-amber-300">{t('admin.update.notComparable')}</p>
          )
        ) : null}

        {data !== undefined && data.commits.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.commits.map((commit) => (
              <li className="rounded border border-slate-800 bg-slate-950/60 p-2" key={commit.sha}>
                <p className="font-mono text-xs text-slate-400">{commit.sha.slice(0, 7)}</p>
                <p className="text-xs text-slate-200">{commit.message}</p>
                <p className="text-xs text-slate-500">
                  {new Date(commit.date).toLocaleString(i18n.language)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {started ? <p className="mt-3 text-emerald-300">{t('admin.update.started')}</p> : null}

        {start.isError ? (
          <p role="alert" className="mt-3 text-rose-300">
            {errorMessage(t, start.error)}
          </p>
        ) : null}

        {/* The stack replaces the API container: after a start the page is
            reloaded by hand, the new version is then visible. */}
        {started || start.isError ? (
          <button
            className="mt-3 w-full rounded border border-slate-600 px-4 py-2 font-medium text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t('admin.update.reload')}
          </button>
        ) : null}

        {data?.updateAvailable === true && !started ? (
          confirming ? (
            <div className="mt-3 flex flex-col gap-2">
              <p>{t('admin.update.confirm')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded bg-sky-700 px-3 py-2 font-medium text-white disabled:opacity-50"
                  disabled={start.isPending}
                  onClick={() => start.mutate()}
                  type="button"
                >
                  {t('admin.update.confirmYes')}
                </button>
                <button
                  className="rounded bg-slate-700 px-3 py-2 font-medium text-white disabled:opacity-50"
                  disabled={start.isPending}
                  onClick={() => setConfirming(false)}
                  type="button"
                >
                  {t('admin.update.confirmNo')}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="mt-3 w-full rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              disabled={start.isPending}
              onClick={() => setConfirming(true)}
              type="button"
            >
              {t('admin.update.startUpdate')}
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}
