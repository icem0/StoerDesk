import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { UpdateRunResponse, UpdateStatusResponse } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The host update of the administration (`specs/18-self-update.md` §18.4–§18.5,
 * ADR-0006).
 *
 * The section reads `GET /api/v1/admin/update/status` and starts one run with
 * `POST /api/v1/admin/update/run`. The run is confirmed explicitly — a confirm
 * step, never a password. The rebuild of the stack replaces the API container,
 * so the API is briefly unreachable during a run; the section says that instead
 * of failing and recovers when the API answers again.
 *
 * The section is hidden without the permission `system.update`. The guard of the
 * server stays the only enforcement point.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'update_agent_unreachable',
  'update_agent_not_configured',
  'update_agent_bad_response',
  'update_already_running',
  'update_rate_limited',
] as const

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.update.host.errors.${code}`)
}

export function UpdateHostUpdate() {
  const { t } = useTranslation('settings')
  const mayUpdate = usePermission('system.update')
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const status = useQuery({
    queryKey: ['admin', 'update', 'status'],
    queryFn: () => apiFetch<UpdateStatusResponse>('/v1/admin/update/status'),
    enabled: mayUpdate,
    retry: false,
    // While a run is active the API comes back after the rebuild of the stack.
    refetchInterval: (query) => (query.state.data?.running === true ? 3000 : false),
  })

  const run = useMutation({
    mutationFn: () => apiFetch<UpdateRunResponse>('/v1/admin/update/run', { method: 'POST' }),
    onSuccess: () => {
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'update', 'status'] })
    },
  })

  if (!mayUpdate) {
    return null
  }

  const data = status.data
  const lastRun = data?.lastRun ?? null
  const running = data?.running === true
  const agentError = data?.agent.error ?? null

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold">{t('admin.update.host.title')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('admin.update.host.hint')}</p>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">{t('admin.update.host.agent')}</dt>
          <dd className="mt-1">
            {data?.agent.reachable === true
              ? t('admin.update.host.agentReady')
              : agentError === 'update_agent_not_configured'
                ? t('admin.update.host.agentNotConfigured')
                : agentError === 'update_agent_bad_response'
                  ? t('admin.update.host.agentBadResponse')
                  : t('admin.update.host.agentMissing')}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">{t('admin.update.host.version')}</dt>
          <dd className="mt-1 font-mono">
            {data?.currentVersion ?? t('admin.update.host.unknownVersion')}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-slate-400">
        {lastRun === null
          ? t('admin.update.host.noRun')
          : `${t('admin.update.host.lastRun')}: ${t(`admin.update.host.status.${lastRun.status}`)}`}
      </p>

      {status.isError ? (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {t('admin.update.host.apiUnreachable')}
        </p>
      ) : null}

      {run.isError ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {errorMessage(t, run.error)}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm">{t('admin.update.host.confirm')}</p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              type="button"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {t('admin.update.host.confirmYes')}
            </button>
            <button
              className="rounded bg-slate-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              type="button"
              onClick={() => setConfirming(false)}
            >
              {t('admin.update.host.confirmNo')}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mt-4 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={running || data?.agent.reachable !== true}
          onClick={() => setConfirming(true)}
        >
          {running ? t('admin.update.host.running') : t('admin.update.host.run')}
        </button>
      )}
    </section>
  )
}
