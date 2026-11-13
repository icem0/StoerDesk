import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  type ChannelConfiguration,
  type ChannelConfigurationListResponse,
  type ChannelTestResponse,
  type MinimumChannelsResponse,
  type NotificationChannelKind,
  type UpdateChannelConfigurationRequest,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Admin channel page (`specs/10-notifications.md` §11.1, §11.11, §11.12,
 * WP-M14-06). The list is the effective configuration of the API; the secret is
 * write-only (ADR-0005), so the field always starts empty and a save only sends
 * a typed value. A test send reports the answer of the adapter; the page adds
 * no status route of its own (that stays WP-M14-19).
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

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

function fieldId(kind: string, field: string): string {
  return `${kind}-${field}`
}

function ChannelCard(props: { channel: ChannelConfiguration; mayWrite: boolean }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const { channel, mayWrite } = props
  const [label, setLabel] = useState(channel.label)
  const [enabled, setEnabled] = useState(channel.enabled)
  const [config, setConfig] = useState<Record<string, string>>({ ...channel.config })
  const [secret, setSecret] = useState('')
  const [testTopic, setTestTopic] = useState('')
  const [saved, setSaved] = useState(false)

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
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const test = useMutation({
    mutationFn: () =>
      apiFetch<ChannelTestResponse>(`/v1/admin/channels/${channel.kind}/test`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ topic: testTopic === '' ? undefined : testTopic }),
      }),
  })

  const failed = test.data !== undefined && !test.data.delivered
  const state = !channel.enabled ? 'disabled' : failed ? 'failed' : 'configured'

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
          <h2 className="text-lg font-semibold">{channel.label}</h2>
          <p className="font-mono text-xs text-slate-400">{channel.kind}</p>
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
          <label className="flex flex-col gap-1 text-sm" htmlFor={fieldId(channel.kind, field)} key={field}>
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
        <label className="flex flex-col gap-1 text-sm" htmlFor={fieldId(channel.kind, 'testTopic')}>
          {t('admin.channels.fields.testTopic')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-60"
            id={fieldId(channel.kind, 'testTopic')}
            onChange={(event) => setTestTopic(event.target.value)}
            placeholder={t('admin.channels.testTopicPlaceholder')}
            value={testTopic}
          />
        </label>
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
            : t('admin.channels.testFailed', { code: test.data.code ?? 'unknown' })}
        </p>
      ) : null}
      {test.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`admin.channels.errors.${errorCode(test.error)}`)}
        </p>
      ) : null}

      {mayWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
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

export function ChannelsPage() {
  const { t } = useTranslation('settings')
  const mayRead = usePermission('notification.read')
  const mayWrite = usePermission('notification.write')
  const mayReadSettings = usePermission('settings.read')
  const mayWriteSettings = usePermission('settings.write')
  const query = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiFetch<ChannelConfigurationListResponse>('/v1/admin/channels'),
    enabled: mayRead,
    retry: false,
  })
  const minimumQuery = useQuery({
    queryKey: ['minimumChannels'],
    queryFn: () =>
      apiFetch<MinimumChannelsResponse>('/v1/settings/notifications/minimum-channels'),
    enabled: mayReadSettings,
    retry: false,
  })
  const queryClient = useQueryClient()
  const saveMinimum = useMutation({
    mutationFn: (body: { channels: string[] }) =>
      apiFetch<MinimumChannelsResponse>('/v1/settings/notifications/minimum-channels', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['minimumChannels'] })
    },
  })

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.channels.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('admin.channels.hint')}</p>
      </div>

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('admin.channels.errors.forbidden')}
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-slate-400">{t('admin.channels.loading')}</p>
      ) : query.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`admin.channels.errors.${errorCode(query.error)}`)}
        </p>
      ) : (query.data?.channels ?? []).length === 0 ? (
        <p className="text-sm text-slate-400">{t('admin.channels.empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(query.data?.channels ?? []).map((channel) => (
            <ChannelCard channel={channel} key={channel.kind} mayWrite={mayWrite} />
          ))}
        </div>
      )}

      {mayReadSettings ? (
        <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div>
            <h2 className="text-lg font-semibold">
              {t('admin.channels.minimum.title')}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {t('admin.channels.minimum.hint')}
            </p>
          </div>

          {!minimumQuery.isLoading && !minimumQuery.isError ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
              <label className="flex flex-col gap-1 text-sm">
                {t('admin.channels.minimum.label')}
              </label>
              {(query.data?.channels ?? []).map((channel) => {
                const selected = (minimumQuery.data?.channels ?? []).includes(channel.kind)

                return (
                  <label
                    className="flex items-center gap-2 text-sm whitespace-nowrap"
                    key={channel.kind}
                  >
                    <input
                      checked={selected}
                      disabled={!mayWriteSettings}
                      onChange={(event) => {
                        const current = minimumQuery.data?.channels ?? []
                        const next = event.target.checked
                          ? [...current, channel.kind]
                          : current.filter((kind) => kind !== channel.kind)

                        saveMinimum.mutate({ channels: next })
                      }}
                      type="checkbox"
                    />
                    {t(`admin.channels.kinds.${channel.kind}`)}
                  </label>
                )
              })}
              {saveMinimum.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {t(`admin.channels.errors.${errorCode(saveMinimum.error)}`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  )
}
