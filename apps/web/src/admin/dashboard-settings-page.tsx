import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { DashboardSettings, UpdateDashboardSettingsRequest } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Administration page for the dashboard and statistics settings
 * (`specs/11-dashboard.md` §11.8, `specs/12-stats.md` §12.6, WP-M9-17).
 *
 * Shows the rotatable TV token with copy and rotate actions, the absolute wall
 * display URL, the anonymisation switch and the conspicuous threshold (1–100).
 * The token is never logged. Without `settings.write` the page is read-only.
 */

const jsonHeaders = { 'content-type': 'application/json' }

function isThreshold(value: string): boolean {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
}

type CopyTarget = 'token' | 'url'

function CopyButton(props: {
  label: string
  copiedLabel: string
  onCopy: () => Promise<void>
  copied: boolean
}) {
  return (
    <button
      className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      onClick={() => void props.onCopy()}
      type="button"
    >
      {props.copied ? props.copiedLabel : props.label}
    </button>
  )
}

function SettingsForm(props: { initial: DashboardSettings; mayWrite: boolean }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const { initial, mayWrite } = props

  const [anonymize, setAnonymize] = useState(initial.tvAnonymize)
  const [threshold, setThreshold] = useState(String(initial.conspicuousThreshold))
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState<CopyTarget | null>(null)

  const wallUrl = `${window.location.origin}/tv/${initial.tvToken}`

  const mutation = useMutation({
    mutationFn: (body: UpdateDashboardSettingsRequest) =>
      apiFetch<DashboardSettings>('/v1/settings/dashboard', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-settings'] })
      setSaved(true)
      setConfirmRotate(false)
    },
  })

  async function copy(target: CopyTarget, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(target)
    } catch {
      setCopied(null)
    }
  }

  const fieldError =
    mutation.error instanceof ApiError &&
    mutation.error.code === 'invalid_request' &&
    Array.isArray(mutation.error.params?.fields) &&
    (mutation.error.params.fields as string[]).includes('conspicuousThreshold')

  const requestError =
    mutation.isError && !fieldError
      ? mutation.error instanceof ApiError &&
        typeof mutation.error.code === 'string' &&
        ['invalid_request', 'forbidden', 'session_invalid'].includes(mutation.error.code)
        ? mutation.error.code
        : 'unknown'
      : null

  return (
    <div className="mt-6 flex flex-col gap-6">
      {!mayWrite ? (
        <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
          {t('dashboardSettings.readOnly')}
        </p>
      ) : null}

      {saved ? <p className="text-sm text-emerald-400">{t('dashboardSettings.saved')}</p> : null}

      {requestError !== null ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`dashboardSettings.errors.${requestError}`)}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold">{t('dashboardSettings.tvToken')}</h2>
        <p className="text-sm text-slate-400">{t('dashboardSettings.tvTokenHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-2 text-sm text-slate-200">
            {initial.tvToken}
          </code>
          <CopyButton
            copied={copied === 'token'}
            copiedLabel={t('dashboardSettings.copied')}
            label={t('dashboardSettings.copy')}
            onCopy={() => copy('token', initial.tvToken)}
          />
        </div>

        <div>
          <p className="text-sm font-medium text-slate-300">{t('dashboardSettings.wallUrl')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-2 text-sm text-slate-200">
              {wallUrl}
            </code>
            <CopyButton
              copied={copied === 'url'}
              copiedLabel={t('dashboardSettings.copied')}
              label={t('dashboardSettings.copy')}
              onCopy={() => copy('url', wallUrl)}
            />
          </div>
        </div>

        {mayWrite ? (
          confirmRotate ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-amber-300">{t('dashboardSettings.rotateConfirm')}</p>
              <button
                className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ rotateTvToken: true })}
                type="button"
              >
                {t('dashboardSettings.rotate')}
              </button>
              <button
                className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
                onClick={() => setConfirmRotate(false)}
                type="button"
              >
                {t('dashboardSettings.rotateCancel')}
              </button>
            </div>
          ) : (
            <button
              className="min-h-11 self-start rounded-lg border border-slate-600 px-3 text-sm text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => setConfirmRotate(true)}
              type="button"
            >
              {t('dashboardSettings.rotate')}
            </button>
          )
        ) : null}
      </section>

      <form
        className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          setThresholdError(null)
          setSaved(false)

          if (!isThreshold(threshold)) {
            setThresholdError(t('dashboardSettings.errors.threshold'))
            return
          }

          mutation.mutate({
            tvAnonymize: anonymize,
            conspicuousThreshold: Number(threshold),
          })
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={anonymize}
            disabled={!mayWrite}
            onChange={(event) => setAnonymize(event.target.checked)}
            type="checkbox"
          />
          {t('dashboardSettings.anonymize')}
        </label>
        <p className="text-xs text-slate-400">{t('dashboardSettings.anonymizeHint')}</p>

        <label className="flex flex-col gap-1 text-sm">
          {t('dashboardSettings.threshold')}
          <input
            className="w-32 rounded bg-slate-950 p-2 text-slate-100"
            disabled={!mayWrite}
            max={100}
            min={1}
            onChange={(event) => setThreshold(event.target.value)}
            type="number"
            value={threshold}
          />
        </label>
        <p className="text-xs text-slate-400">{t('dashboardSettings.thresholdHint')}</p>
        {thresholdError !== null ? (
          <p className="text-sm text-rose-400" role="alert">
            {thresholdError}
          </p>
        ) : null}
        {fieldError ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('dashboardSettings.errors.threshold')}
          </p>
        ) : null}

        {mayWrite ? (
          <button
            className="min-h-11 self-start rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            disabled={mutation.isPending}
            type="submit"
          >
            {t('dashboardSettings.save')}
          </button>
        ) : null}
      </form>
    </div>
  )
}

export function DashboardSettingsPage() {
  const { t } = useTranslation('settings')
  const mayRead = usePermission('settings.read')
  const mayWrite = usePermission('settings.write')

  const query = useQuery({
    queryKey: ['dashboard-settings'],
    queryFn: () => apiFetch<DashboardSettings>('/v1/settings/dashboard'),
    enabled: mayRead,
    retry: false,
  })

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin"
      >
        {t('admin.back')}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t('dashboardSettings.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('dashboardSettings.hint')}</p>
      </div>

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('dashboardSettings.errors.forbidden')}
        </p>
      ) : query.isPending ? (
        <p className="text-sm text-slate-400">{t('dashboardSettings.loading')}</p>
      ) : query.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('dashboardSettings.errors.unknown')}
        </p>
      ) : (
        <SettingsForm initial={query.data} key={query.data.tvToken} mayWrite={mayWrite} />
      )}
    </section>
  )
}
