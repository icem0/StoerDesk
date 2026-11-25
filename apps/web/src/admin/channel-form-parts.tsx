import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  type ChannelConfiguration,
  type ChannelTestResponse,
  type NotificationChannelKind,
  type UpdateChannelConfigurationRequest,
} from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../lib/api'
import { NtfySubscription } from '../features/settings/NtfySubscription'

/**
 * The form of one channel (`/admin/channels/:kind`, WP-M29-05): its editable
 * fields, its write-only secret, its test send and its save. Extracted from
 * channels-page.tsx so every channel gets its own page.
 */

const jsonHeaders = { 'content-type': 'application/json' }

const CHANNEL_FIELDS: Record<NotificationChannelKind, readonly string[]> = {
  signal: ['cliUrl', 'sourceNumber', 'recipients'],
  matrix: ['homeserver', 'roomId'],
  ntfy: ['url', 'topic'],
  email: ['host', 'port', 'secure', 'user', 'from'],
  telegram: ['chatId'],
  webpush: ['publicKey', 'subject'],
  whatsapp: ['baseUrl'],
}

export function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

/**
 * Builds a copy-pasteable curl command that reproduces the ntfy JSON publish:
 * `POST /` with `topic` in the body and the numeric priority (3 = default).
 * A self-hosted server needs the access token of the channel (ADR-0022): the
 * command carries the shell variable `$NTFY_TOKEN`, never the stored key — the
 * secret is write-only and stays out of the answer, the clipboard and the repo.
 * See https://docs.ntfy.sh/publish/#publish.
 */
function buildNtfyCurl(
  url: string,
  topic: string,
  secretSet: boolean,
  title: string,
  message: string,
): string {
  const base = `${url.replace(/\/+$/, '')}/`
  const body = JSON.stringify({
    topic,
    title,
    message,
    priority: 3,
  })
  const lines = [
    `curl -X POST "${base}"`,
    '  -H "Content-Type: application/json"',
    ...(secretSet ? ['  -H "Authorization: Bearer $NTFY_TOKEN"'] : []),
    '  -H "Priority: 3"',
    `  -d '${body}'`,
  ]

  return lines.join(' \\\n')
}

function fieldId(kind: string, field: string): string {
  return `${kind}-${field}`
}

/**
 * Builds a translate-based error-code → readable-reason function for one
 * component. The texts of the channel administration (`admin.channels.errors.*`)
 * are written for ntfy: they name its topic, its token and its server
 * (WP-M14-161d). Every other channel reads the neutral texts of the delivery
 * page (`admin.delivery.reasons.<kind>.<code>`, then
 * `admin.delivery.reasons.<code>`), so the card of the web push never answers
 * with an ntfy sentence and the card of Matrix never claims a taken topic
 * (WP-M15-09). A code without a text falls back to
 * `admin.channels.errors.channel_error`, which names the machine code and
 * points to the log of the API and to the page of the delivery problems.
 */
export function makeReasonOf(t: unknown) {
  const translate = t as (key: string, opts?: unknown) => string

  return (code: string, kind: string): string => {
    if (code === '') {
      return ''
    }

    if (kind !== 'ntfy') {
      const own = translate(`admin.delivery.reasons.${kind}.${code}`, { defaultValue: '' })

      if (own !== '') {
        return own
      }

      const neutral = translate(`admin.delivery.reasons.${code}`, { defaultValue: '' })

      if (neutral !== '') {
        return neutral
      }

      return translate('admin.channels.errors.channel_error', { code })
    }

    const key = `admin.channels.errors.${code}`
    const translated = translate(key)

    return translated === key ? translate('admin.channels.errors.http_error', { code }) : translated
  }
}

export function ChannelCard(props: { channel: ChannelConfiguration; mayWrite: boolean; showTitle?: boolean }) {
  const { t } = useTranslation('settings')
  const reasonOf = makeReasonOf(t)
  const queryClient = useQueryClient()
  const { channel, mayWrite } = props
  const showTitle = props.showTitle !== false
  const [label, setLabel] = useState(channel.label)
  const [enabled, setEnabled] = useState(channel.enabled)
  const [config, setConfig] = useState<Record<string, string>>({ ...channel.config })
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')

  const save = useMutation({
    mutationFn: (body: UpdateChannelConfigurationRequest) =>
      apiFetch<ChannelConfiguration>(`/v1/admin/channels/${channel.kind}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setSecret('')
      setSaved(true)
      // A saved configuration is a new target: the old code no longer applies.
      setVerificationCode('')
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const requestVerification = useMutation({
    mutationFn: () =>
      // Fastify 5 rejects an empty body when the content type is JSON
      // (`FST_ERR_CTP_EMPTY_JSON_BODY`) before the route runs, so a POST
      // without payload still has to send a JSON body (WP-M14-55).
      apiFetch<{ expiresAt: string }>('/v1/admin/channels/ntfy/verification', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
  })

  const confirmVerification = useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ verified: true }>('/v1/admin/channels/ntfy/verification/confirm', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      setVerificationCode('')
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const test = useMutation({
    mutationFn: () =>
      apiFetch<ChannelTestResponse>(`/v1/admin/channels/${channel.kind}/test`, {
        method: 'POST',
        headers: jsonHeaders,
        // The saved row is the test target (WP-M14-51); the JSON content type
        // needs a body (WP-M14-55), so no `topic` override travels from here.
        body: JSON.stringify({}),
      }),
  })

  const failed = test.data !== undefined && !test.data.delivered
  // "Configured" is a promise to the operator: ntfy only earns it after the
  // one-time code came back from the topic (WP-M14-47). A channel without a
  // proof stays visibly "unverified" — never green because a key is stored.
  const state = !channel.enabled
    ? 'disabled'
    : failed
      ? 'failed'
      : channel.kind === 'ntfy' && channel.verified !== true
        ? 'unverified'
        : 'configured'
  const ntfyTarget =
    channel.kind === 'ntfy' && channel.config.url && channel.config.topic
      ? { publicUrl: channel.config.url, topic: channel.config.topic }
      : undefined

  // A request that never produced a known machine code (a Fastify rejection such as
  // FST_ERR_CTP_EMPTY_JSON_BODY, or no network) names its status and code instead of
  // showing the raw i18n key.
  const errorText = (error: unknown): string => {
    if (!(error instanceof ApiError) || error.code === undefined) {
      return t('admin.channels.errors.request_failed', { status: 'n/a', code: 'network' })
    }

    const key = `admin.channels.errors.${error.code}`
    const translated = t(key)

    return translated === key
      ? t('admin.channels.errors.request_failed', { status: error.status, code: error.code })
      : translated
  }

  const apiReason = (error: unknown): string => {
    const raw = error instanceof ApiError ? error.params?.reason : undefined

    return typeof raw === 'string' && raw !== '' ? reasonOf(raw, 'ntfy') : ''
  }
  const verificationErrorText = (error: unknown): string => {
    const code = errorCode(error)
    const key = `admin.channels.verification.errors.${code}`
    const translated = t(key)
    const reason = apiReason(error) === '' ? reasonOf(code, 'ntfy') : apiReason(error)

    return translated === key
      ? t('admin.channels.verification.errors.unknown', { reason })
      : translated
  }

  function saveChannel() {
    setSaved(false)
    save.mutate({
      label,
      enabled,
      config,
      ...(secret === '' ? {} : { secret }),
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {showTitle && <h2 className="text-lg font-semibold">{channel.label}</h2>}
          {showTitle && <p className="font-mono text-xs text-slate-400">{channel.kind}</p>}
        </div>
        <span className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300">
          {t('admin.channels.stateLabel')}: {t(`admin.channels.state.${state}`)}
        </span>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        {t('admin.channels.fields.label')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-60"
          disabled={!mayWrite}
          onChange={(event) => setLabel(event.target.value)}
          value={label}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          checked={enabled}
          disabled={!mayWrite}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        {t('admin.channels.fields.enabled')}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNEL_FIELDS[channel.kind].map((field) => (
          <label
            className="flex flex-col gap-1 text-sm"
            htmlFor={fieldId(channel.kind, field)}
            key={field}
          >
            {t(`admin.channels.fields.${field}`)}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-60"
              disabled={!mayWrite}
              id={fieldId(channel.kind, field)}
              onChange={(event) =>
                setConfig((current) => ({ ...current, [field]: event.target.value }))
              }
              value={config[field] ?? ''}
            />
          </label>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        {channel.secretSet ? t('admin.channels.secretSet') : t('admin.channels.secretUnset')}
      </p>
      {channel.kind === 'webpush' && channel.secretSet !== (config.publicKey !== '') ? (
        <p className="text-xs text-amber-300">{t('admin.channels.webpushIncompleteTrio')}</p>
      ) : null}
      {channel.kind === 'webpush' ? (
        <p className="text-xs text-slate-400">
          <Link className="text-accent-300 underline" to="/help/web-push">
            {t('admin.channels.webpushGuide')}
          </Link>
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm" htmlFor={fieldId(channel.kind, 'secret')}>
        {t('admin.channels.secret')}
        <input
          autoComplete="new-password"
          className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-60"
          disabled={!mayWrite}
          id={fieldId(channel.kind, 'secret')}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={t('admin.channels.secretKeep')}
          type="password"
          value={secret}
        />
      </label>

      {channel.kind === 'ntfy' && mayWrite ? (
        <>
          {config.url && config.topic ? (
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor={fieldId(channel.kind, 'curlCommand')}>
                {t('admin.channels.curlCommand')}
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  className="flex-1 rounded bg-slate-950 p-2 text-slate-100 text-xs font-mono disabled:opacity-60"
                  id={fieldId(channel.kind, 'curlCommand')}
                  readOnly
                  value={buildNtfyCurl(
                    config.url!,
                    config.topic!,
                    channel.secretSet,
                    t('admin.channels.testTitle'),
                    t('admin.channels.testBody'),
                  )}
                />
                <button
                  className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      buildNtfyCurl(
                        config.url!,
                        config.topic!,
                        channel.secretSet,
                        t('admin.channels.testTitle'),
                        t('admin.channels.testBody'),
                      ),
                    )
                  }}
                  title={t('admin.channels.copyToClipboard')}
                  type="button"
                >
                  {t('admin.channels.copy')}
                </button>
              </div>
              {channel.secretSet ? (
                <p className="mt-1 text-xs text-slate-400">{t('admin.channels.curlTokenHint')}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {channel.kind === 'ntfy' ? (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-sm">
          <h3 className="font-semibold">{t('admin.channels.verification.heading')}</h3>
          <p className="text-xs text-slate-400">{t('admin.channels.verification.hint')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300">
            <li>{t('admin.channels.verification.stepSave')}</li>
            <li>{t('admin.channels.verification.stepSubscribe')}</li>
            <li>{t('admin.channels.verification.stepCode')}</li>
          </ol>
          {ntfyTarget !== undefined ? (
            <NtfySubscription publicUrl={ntfyTarget.publicUrl} topic={ntfyTarget.topic} />
          ) : (
            <p className="text-xs text-amber-300">{t('admin.channels.verification.saveFirst')}</p>
          )}
          <p className="text-xs text-slate-400">{t('admin.channels.verification.testUsesSaved')}</p>
          {channel.enabled && !channel.secretSet ? (
            <p className="text-xs text-amber-300">{t('admin.channels.ntfyTokenHint')}</p>
          ) : null}
          <Link className="text-xs text-accent-300 underline" to="/settings/notifications">
            {t('admin.channels.verification.personalLink')}
          </Link>

          {channel.verified === true ? (
            <p className="text-sm text-emerald-300" role="status">
              {t('admin.channels.verification.verified')}
            </p>
          ) : mayWrite && channel.enabled && ntfyTarget !== undefined ? (
            <>
              {requestVerification.isSuccess ? (
                <p className="text-sm text-emerald-300" role="status">
                  {t('admin.channels.verification.sent', {
                    time: new Date(requestVerification.data.expiresAt).toLocaleTimeString(),
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <button
                  className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  disabled={requestVerification.isPending}
                  onClick={() => requestVerification.mutate()}
                  type="button"
                >
                  {requestVerification.isPending
                    ? t('admin.channels.verification.sending')
                    : t('admin.channels.verification.send')}
                </button>
                {requestVerification.isSuccess ? (
                  <>
                    <label
                      className="flex flex-col gap-1 text-xs"
                      htmlFor={fieldId(channel.kind, 'verificationCode')}
                    >
                      {t('admin.channels.verification.code')}
                      <input
                        autoComplete="one-time-code"
                        className="rounded bg-slate-950 p-2 text-slate-100"
                        id={fieldId(channel.kind, 'verificationCode')}
                        maxLength={6}
                        onChange={(event) => setVerificationCode(event.target.value)}
                        placeholder={t('admin.channels.verification.codePlaceholder')}
                        value={verificationCode}
                      />
                    </label>
                    <button
                      className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      disabled={confirmVerification.isPending || verificationCode.trim() === ''}
                      onClick={() => confirmVerification.mutate(verificationCode)}
                      type="button"
                    >
                      {confirmVerification.isPending
                        ? t('admin.channels.verification.confirming')
                        : t('admin.channels.verification.confirm')}
                    </button>
                  </>
                ) : null}
              </div>
              {requestVerification.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {verificationErrorText(requestVerification.error)}
                </p>
              ) : null}
              {confirmVerification.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {verificationErrorText(confirmVerification.error)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {!mayWrite ? <p className="text-sm text-slate-400">{t('admin.channels.readOnly')}</p> : null}
      {save.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`admin.channels.errors.${errorCode(save.error)}`)}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-emerald-300">{t('admin.channels.saved')}</p> : null}
      {test.isSuccess ? (
        <p
          className={`text-sm ${test.data.delivered ? 'text-emerald-300' : 'text-rose-400'}`}
          role="status"
        >
          {test.data.delivered
            ? t('admin.channels.testDelivered')
            : t('admin.channels.testFailed', {
                reason: reasonOf(test.data.code ?? '', channel.kind),
              })}
        </p>
      ) : null}
      {test.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {errorText(test.error)}
        </p>
      ) : null}

      {mayWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
            disabled={save.isPending}
            onClick={saveChannel}
            type="button"
          >
            {t('admin.channels.save')}
          </button>
          <button
            className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            disabled={test.isPending}
            onClick={() => test.mutate()}
            type="button"
          >
            {test.isPending ? t('admin.channels.testing') : t('admin.channels.test')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
