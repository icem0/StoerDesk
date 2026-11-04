import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { UpdateRunResponse, UpdateStatusResponse } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'
import { appVersion } from '../lib/version'

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
 * The button needs the update agent; without it the section shows the one-time
 * start command and can copy it to the clipboard. The command runs **in the
 * project folder of the running stack** and pins that folder with
 * `--project-directory "$PWD"` together with the project name read from the
 * `com.docker.compose.project` label — the `working_dir` label is deliberately
 * unused, because it holds the path inside the container that ran compose and
 * is therefore not a path of the host under a panel such as Arcane. The compose
 * file needs `POSTGRES_PASSWORD` and `SESSION_SECRET` and loads `.env` of the
 * project, so the command first fills only the missing keys of that file from
 * the environment of the running `api` container: an existing value is never
 * rewritten and no secret ever appears on the host command line.
 *
 * The section is hidden without the permission `system.update`. The guard of the
 * server stays the only enforcement point.
 */

const AGENT_START_COMMAND = [
  'PROJECT=$(docker ps --filter label=com.docker.compose.service=web --format \'{{.Label "com.docker.compose.project"}}\' | head -n1)',
  'API=$(docker ps -q --filter label=com.docker.compose.service=api | head -n1)',
  'umask 077',
  'for k in POSTGRES_PASSWORD SESSION_SECRET; do',
  '  grep -q "^$k=" .env 2>/dev/null ||',
  '    printf \'%s=%s\\n\' "$k" "$(docker exec "$API" printenv "$k")" >> .env',
  'done',
  'IMAGE_BUILD_CONTEXT=https://github.com/icem0/StoerDesk.git#main \\',
  '  docker compose -p "$PROJECT" --project-directory "$PWD" --profile update up -d --build update-agent',
].join('\n')
const GITHUB_TAGS_URL = 'https://api.github.com/repos/icem0/StoerDesk/tags?per_page=1'

/** `null` for a version that cannot be compared, e.g. `dev`. */
function parseVersion(v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)/)

  if (!m) {
    return null
  }

  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** `true`/`false` for comparable versions, `null` when one is unknown. */
function isNewerVersion(latest: string, current: string): boolean | null {
  const a = parseVersion(latest)
  const b = parseVersion(current)

  if (a === null || b === null) {
    return null
  }

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return (a[index] ?? 0) > (b[index] ?? 0)
    }
  }

  return false
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'update_agent_unreachable',
  'update_agent_not_configured',
  'update_agent_bad_response',
  'update_already_running',
  'update_rate_limited',
  'update_git_failed',
  'update_compose_failed',
  'update_prune_failed',
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

/** Lesbare Beschreibung eines Fehlercodes. */
function errorCodeText(t: TFunction<'settings'>, code: string | null): string {
  if (code === null || code === '') {
    return ''
  }

  return t(`admin.update.host.errorCodes.${code}` as `admin.update.host.errorCodes.${string}`)
}

export function UpdateHostUpdate({
  clientVersion = appVersion,
}: {
  clientVersion?: string
} = {}) {
  const { t } = useTranslation('settings')
  const mayUpdate = usePermission('system.update')
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'done' | 'failed'>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(AGENT_START_COMMAND)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [])

  const checkUpdate = useCallback(async () => {
    setCheckState('checking')
    setLatestVersion(null)

    try {
      const response = await fetch(GITHUB_TAGS_URL)

      if (!response.ok) {
        throw new Error('check failed')
      }

      const tags = await response.json()
      const latest = tags[0]?.name

      if (!latest) {
        throw new Error('no tags')
      }

      setLatestVersion(latest)
      setCheckState('done')
    } catch {
      setCheckState('failed')
    }
  }, [])

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
  const agentReachable = data?.agent.reachable === true
  // The agent knows the version of the checkout; a panel without git metadata
  // reports none, so fall back to the version this UI was built with.
  const currentVersion = data?.currentVersion ?? clientVersion
  const comparison =
    latestVersion === null ? null : isNewerVersion(latestVersion, currentVersion)
  const updateAvailable = comparison === true

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
          <dt className="text-slate-400">{t('admin.update.host.currentVersion')}</dt>
          <dd className="mt-1 font-mono">
            {data?.currentVersion ?? (
              <span>
                {clientVersion} <span className="text-slate-500">({t('admin.update.host.clientVersion')})</span>
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded border border-slate-700 bg-slate-950/60 p-3 text-sm">
        <p className="font-medium">{t('admin.update.host.check.title')}</p>

        {checkState === 'idle' ? (
          <button
            className="mt-2 rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
            type="button"
            onClick={() => void checkUpdate()}
          >
            {t('admin.update.host.checkUpdate')}
          </button>
        ) : checkState === 'checking' ? (
          <p className="mt-2 text-sm text-slate-400">{t('admin.update.host.checking')}</p>
        ) : checkState === 'failed' ? (
          <p className="mt-2 text-sm text-rose-300">{t('admin.update.host.checkFailed')}</p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              {t('admin.update.host.currentVersion')}:{' '}
              <span className="font-mono">{currentVersion}</span>
            </p>
            <p className="mt-1 text-sm">
              {t('admin.update.host.latestVersion')}:{' '}
              <span className="font-mono">{latestVersion}</span>
            </p>

            {updateAvailable ? (
              <>
                <p className="mt-1 text-sm text-emerald-300">{t('admin.update.host.updateAvailable')}</p>
                {agentReachable ? (
                  <button
                    className="mt-1 rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                    type="button"
                    disabled={running}
                    onClick={() => setConfirming(true)}
                  >
                    {t('admin.update.host.startUpdate')}
                  </button>
                ) : null}
              </>
            ) : comparison === false ? (
              <p className="mt-1 text-sm text-emerald-300">{t('admin.update.host.upToDate')}</p>
            ) : (
              <p className="mt-1 text-sm text-amber-300">{t('admin.update.host.versionUnknown')}</p>
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-400">
        {lastRun === null
          ? t('admin.update.host.noRun')
          : `${t('admin.update.host.lastRun')}: ${t(
              `admin.update.host.status.${lastRun.status}`,
            )}${errorCodeText(t, lastRun.errorCode) ? ` — ${errorCodeText(t, lastRun.errorCode)}` : ''}`}
      </p>

      {lastRun?.errorDetail ? (
        <div className="mt-2 text-sm">
          <p className="text-slate-400">{t('admin.update.host.errorDetailLabel')}</p>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-700 bg-slate-950/60 p-2 font-mono text-xs text-slate-200">
            {lastRun.errorDetail}
          </pre>
        </div>
      ) : null}

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

      {!agentReachable ? (
        <div className="mt-4 rounded border border-slate-700 bg-slate-950/60 p-3 text-sm">
          <p className="font-medium">{t('admin.update.host.guide.title')}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{t('admin.update.host.guide.step1')}</li>
            <li>{t('admin.update.host.guide.step2')}</li>
          </ol>
          <pre className="mt-3 max-w-full overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 px-2 py-1 font-mono text-xs">
            {AGENT_START_COMMAND}
          </pre>
          <button
            className="mt-2 rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            type="button"
            onClick={() => void copyCommand()}
          >
            {copied ? t('admin.update.host.guide.copied') : t('admin.update.host.guide.copy')}
          </button>
          <p className="mt-3 text-slate-400">{t('admin.update.host.guide.hint')}</p>
        </div>
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
      ) : agentReachable ? (
        <button
          className="mt-4 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="button"
          disabled={running}
          onClick={() => setConfirming(true)}
        >
          {running ? t('admin.update.host.running') : t('admin.update.host.run')}
        </button>
      ) : null}
    </section>
  )
}
