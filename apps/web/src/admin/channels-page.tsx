import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  type ChannelConfigurationListResponse,
  type ChannelStatusListResponse,
  type AlarmSettings,
  type ChannelPolicyResponse,
  type NotificationComplianceListResponse,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { HelpPopover } from '../components/help-popover'
import { helpTriggerClass } from '../components/help-trigger'
import { apiFetch } from '../lib/api'
import { ChannelCard, errorCode, makeReasonOf } from './channel-form-parts'

/**
 * Admin channel page (`specs/10-notifications.md` §11.1, §11.11, §11.12,
 * WP-M14-06). The list is the effective configuration of the API; every
 * channel links to its own page (`/admin/channels/:kind`, WP-M29-05) where its
 * form lives. A channel with failed rows in the outbox is visible here as well
 * (WP-M14-19, §11.8) — a channel with failed rows is a warning, never an error
 * of the administration.
 */

const jsonHeaders = { 'content-type': 'application/json' }

/**
 * The failing channels of `GET /api/v1/notifications/status` (§11.8, WP-M14-19):
 * every channel that has failed rows in the outbox.
 */
function failingChannelsOf(status: ChannelStatusListResponse | undefined) {
  return (status?.channels ?? []).filter((channel) => channel.failed > 0)
}

export function ChannelsPage() {
  const { t } = useTranslation('settings')
  const reasonOf = makeReasonOf(t)
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
  const policyQuery = useQuery({
    queryKey: ['channelPolicy'],
    queryFn: () => apiFetch<ChannelPolicyResponse>('/v1/settings/notifications/channel-policy'),
    enabled: mayReadSettings,
    retry: false,
  })
  /** The alarm of the installation (§11.17, ADR-0048). */
  const alarmQuery = useQuery({
    queryKey: ['alarmSettings'],
    queryFn: () => apiFetch<AlarmSettings>('/v1/settings/notifications/alarm'),
    enabled: mayReadSettings,
    retry: false,
  })

  const complianceQuery = useQuery({
    queryKey: ['notificationCompliance'],
    queryFn: () =>
      apiFetch<NotificationComplianceListResponse>('/v1/admin/notifications/compliance'),
    enabled: mayRead,
    retry: false,
  })
  const statusQuery = useQuery({
    queryKey: ['channelStatus'],
    queryFn: () => apiFetch<ChannelStatusListResponse>('/v1/notifications/status'),
    enabled: mayRead,
    retry: false,
  })
  const queryClient = useQueryClient()
  const saveAlarm = useMutation({
    mutationFn: (body: { toneEnabled: boolean; repeatSeconds: number }) =>
      apiFetch<AlarmSettings>('/v1/settings/notifications/alarm', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alarmSettings'] })
    },
  })

  const savePolicy = useMutation({
    mutationFn: (body: { requiredChannels: string[]; minimumChannelCount: number }) =>
      apiFetch<ChannelPolicyResponse>('/v1/settings/notifications/channel-policy', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['channelPolicy'] })
      void queryClient.invalidateQueries({ queryKey: ['notificationCompliance'] })
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

      {mayRead && failingChannelsOf(statusQuery.data).length > 0 ? (
        <section
          aria-live="polite"
          className="flex flex-col gap-2 rounded-xl border border-rose-700 bg-slate-900/60 p-4"
        >
          <h2 className="text-lg font-semibold">{t('admin.channels.failing.title')}</h2>
          <ul className="flex flex-col gap-1">
            {failingChannelsOf(statusQuery.data).map((channel) => (
              <li className="flex flex-wrap items-baseline gap-2 text-sm" key={channel.name}>
                <span className="font-medium text-slate-200">
                  {t(`admin.channels.kinds.${channel.name}`)}
                </span>
                <span className="text-rose-300">
                  {t('admin.channels.failing.failed', { count: channel.failed })}
                </span>
                {channel.lastFailedAt !== null ? (
                  <span className="text-slate-400">
                    {t('admin.channels.failing.lastFailure', {
                      time: new Date(channel.lastFailedAt).toLocaleString(),
                    })}
                  </span>
                ) : null}
                {channel.lastError !== null && channel.lastError !== '' ? (
                  <span className="text-rose-300 text-xs ml-2">
                    {reasonOf(channel.lastError, channel.name)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mayReadSettings ? (
        <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold">{t('admin.channels.policy.title')}</h2>
            <HelpPopover
              className={helpTriggerClass}
              label={t('help:triggerFor', { name: t('admin.channels.policy.title') })}
              text={t('admin.channels.policy.hint')}
            />
          </div>

          {!policyQuery.isLoading && !policyQuery.isError ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-4">
                {(query.data?.channels ?? [])
                  .filter((channel) => channel.kind !== 'signal')
                  .map((channel) => {
                    const selected = (
                      policyQuery.data?.requiredChannels ?? []
                    ).includes(channel.kind)

                    return (
                      <label
                        className="flex items-center gap-2 text-sm whitespace-nowrap"
                        key={channel.kind}
                      >
                        <input
                          checked={selected}
                          disabled={!mayWriteSettings}
                          onChange={(event) => {
                            const current = policyQuery.data?.requiredChannels ?? []
                            const next = event.target.checked
                              ? [...current, channel.kind]
                              : current.filter((kind) => kind !== channel.kind)

                            savePolicy.mutate({
                              requiredChannels: next,
                              minimumChannelCount: policyQuery.data?.minimumChannelCount ?? 0,
                            })
                          }}
                          type="checkbox"
                        />
                        {t(`admin.channels.kinds.${channel.kind}`)}
                      </label>
                    )
                  })}
              </div>

              <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
                {t('admin.channels.policy.countLabel')}
                <input
                  className="rounded bg-slate-950 p-2"
                  disabled={!mayWriteSettings}
                  min={0}
                  onChange={(event) =>
                    savePolicy.mutate({
                      requiredChannels: policyQuery.data?.requiredChannels ?? [],
                      minimumChannelCount: Number(event.target.value) || 0,
                    })
                  }
                  type="number"
                  value={policyQuery.data?.minimumChannelCount ?? 0}
                />
              </label>

              {savePolicy.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {t(`admin.channels.errors.${errorCode(savePolicy.error)}`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {mayReadSettings ? (
        <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold">{t('admin.channels.alarm.title')}</h2>
            <HelpPopover
              className={helpTriggerClass}
              label={t('help:triggerFor', { name: t('admin.channels.alarm.title') })}
              text={t('admin.channels.alarm.hint')}
            />
          </div>

          {!alarmQuery.isLoading && !alarmQuery.isError ? (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={alarmQuery.data?.toneEnabled ?? true}
                  disabled={!mayWriteSettings}
                  onChange={(event) =>
                    saveAlarm.mutate({
                      toneEnabled: event.target.checked,
                      repeatSeconds: alarmQuery.data?.repeatSeconds ?? 60,
                    })}
                  type="checkbox"
                />
                {t('admin.channels.alarm.tone')}
              </label>

              <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
                {t('admin.channels.alarm.repeat')}
                <input
                  className="rounded bg-slate-950 p-2"
                  disabled={!mayWriteSettings}
                  min={15}
                  max={600}
                  onChange={(event) =>
                    saveAlarm.mutate({
                      toneEnabled: alarmQuery.data?.toneEnabled ?? true,
                      repeatSeconds: Number(event.target.value) || 60,
                    })}
                  type="number"
                  value={alarmQuery.data?.repeatSeconds ?? 60}
                />
              </label>

              <p className="text-sm text-slate-400">{t('admin.channels.alarm.repeatHint')}</p>

              {saveAlarm.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {t(`admin.channels.errors.${errorCode(saveAlarm.error)}`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {mayRead ? (
        <section className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold">{t('admin.channels.compliance.title')}</h2>
            <HelpPopover
              className={helpTriggerClass}
              label={t('help:triggerFor', { name: t('admin.channels.compliance.title') })}
              text={t('admin.channels.compliance.hint')}
            />
          </div>

          {(complianceQuery.data?.users ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">{t('admin.channels.compliance.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(complianceQuery.data?.users ?? []).map((user) => (
                <li className="flex flex-wrap items-center gap-2 text-sm" key={user.userId}>
                  <span className="min-w-40 font-medium">{user.name}</span>
                  <span
                    aria-hidden="true"
                    className={user.compliant ? 'text-emerald-400' : 'text-amber-400'}
                  >
                    {user.compliant ? '✓' : '●'}
                  </span>
                  <span className="text-slate-400">
                    {user.compliant
                      ? t('admin.channels.compliance.compliant')
                      : t('admin.channels.compliance.missing', {
                          channels: user.missing
                          .map((kind) => t(`admin.channels.kinds.${kind}`))
                          .join(', '),
                        count: user.channelCount,
                      }) }
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  )
}