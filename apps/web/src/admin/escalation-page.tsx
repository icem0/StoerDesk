import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ESCALATION_STAGE_KEYS,
  ESCALATION_REFERENCE_EVENTS,
  TICKET_PRIORITIES,
  escalationRuleConfigSchema,
  type DeadlineHours,
  type DeadlineSettings,
  type EscalationConfig,
  type EscalationMinutes,
  type EscalationReferenceEvent,
  type EscalationRuleConfig,
  type EscalationStageConfig,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'
import { EscalationConditionBuilder } from './escalation-condition-builder'
import { EscalationActionEditor } from './escalation-action-editor'

/**
 * The escalation administration (`specs/07-escalation.md` §7.1–§7.9, ADR-0017,
 * WP-M13-14/15/16).
 *
 * The tab "Fristen" carries the deadline hours per priority (the form of the
 * former deadlines page); the tab "Stufen & Regeln" carries the stages with
 * their names, their active flag and their rules: the reference, the minutes
 * per priority, the condition and the ordered actions of a rule. The
 * administration saves the rules with one request
 * (`PUT /api/v1/escalation/config`) and the stage names with
 * `PUT /api/v1/escalation/stages`. Without `settings.write` the editors stay
 * read-only; the server enforces the permission again.
 *
 * The route `/admin/deadlines` redirects here, so old bookmarks keep working.
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const
const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.escalation.errors.${code}`)
}

function useDeadlineSettings() {
  return useQuery({
    queryKey: ['deadline-settings'],
    queryFn: () => apiFetch<DeadlineSettings>('/v1/settings/deadlines'),
    retry: false,
  })
}

function useEscalationConfig() {
  return useQuery({
    queryKey: ['escalation-config'],
    queryFn: () => apiFetch<EscalationConfig>('/v1/escalation/config'),
    retry: false,
  })
}

function useChannelNames() {
  return useQuery({
    queryKey: ['escalation-channels'],
    queryFn: () => apiFetch<{ channels: string[] }>('/v1/escalation/channels'),
    retry: false,
  })
}

function useWebhookIds() {
  return useQuery({
    queryKey: ['escalation-webhooks'],
    queryFn: () => apiFetch<{ webhooks: { id: string }[] }>('/v1/webhooks'),
    retry: false,
  })
}

export function EscalationPage() {
  const { t, i18n } = useTranslation('settings')
  const settingsQuery = useDeadlineSettings()
  const configQuery = useEscalationConfig()
  const channelsQuery = useChannelNames()
  const webhooksQuery = useWebhookIds()
  const canWrite = usePermission('settings.write')

  const [tab, setTab] = useState('fristen')
  const [savedHours, setSavedHours] = useState<DeadlineHours | null>(null)
  const [savedConfig, setSavedConfig] = useState<EscalationConfig | null>(null)
  const hours = savedHours ?? (settingsQuery.data?.hours ?? { low: 72, normal: 72, high: 72, critical: 72 })
  const config = savedConfig ?? (configQuery.data ?? { stages: [], rules: [] })

  const saveHours = useMutation({
    mutationFn: (body: DeadlineSettings) =>
      apiFetch<DeadlineSettings>('/v1/settings/deadlines', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => setSavedHours(saved.hours as DeadlineHours),
  })

  const saveRules = useMutation({
    mutationFn: (body: { rules: EscalationRuleConfig[] }) =>
      apiFetch<unknown>('/v1/escalation/config', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => setSavedConfig({ ...config, rules: (saved as EscalationConfig).rules }),
  })

  const saveStages = useMutation({
    mutationFn: (body: { stages: EscalationStageConfig[] }) =>
      apiFetch<unknown>('/v1/escalation/stages', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) =>
      setSavedConfig({ ...config, stages: (saved as EscalationConfig).stages }),
  })

  if (configQuery.isPending) {
    return <p className="text-slate-400">{t('admin.escalation.loading')}</p>
  }

  if (configQuery.isError) {
    return <p className="text-rose-400 text-sm" role="alert">{t('admin.escalation.errors.unknown')}</p>
  }

  const stageNames = new Map<string, Record<string, string>>(
    config.stages.map((stage) => [stage.key, stage.names]),
  )

  function stageName(key: string): string {
    const names = stageNames.get(key)

    return names === undefined ? key : (names[i18n.language] ?? names.de ?? key)
  }

  const rulesOfStage = (key: string) =>
    config.rules.filter((rule) => rule.stageKey === key)

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('admin.escalation.title')}</h1>
        <p className="text-sm text-slate-400">{t('admin.escalation.hint')}</p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="escalation-tabs">
        <button
          className={`rounded px-3 py-2 text-sm ${tab === 'fristen' ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          onClick={() => setTab('fristen')}
          type="button"
        >
          {t('admin.escalation.tabs.fristen')}
        </button>
        <button
          className={`rounded px-3 py-2 text-sm ${tab === 'stages' ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          onClick={() => setTab('stages')}
          type="button"
        >
          {t('admin.escalation.tabs.stages')}
        </button>
      </div>

      {saveRules.isError || saveHours.isError ? (
        <p role="alert" className="text-sm text-rose-400">
          {errorMessage(t, saveRules.error ?? saveHours.error)}
        </p>
      ) : null}

      {tab === 'fristen' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-4" data-testid="escalation-hours">
            {TICKET_PRIORITIES.map((priority) => (
              <label key={priority} className="text-xs text-slate-400">
                {t(`admin.escalation.hours.${priority}`)}
                <input
                  className="w-28 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  max={8760}
                  min={1}
                  required
                  step={1}
                  type="number"
                  value={hours[priority]}
                  onChange={(event) =>
                    setSavedHours({ ...hours, [priority]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          {!canWrite ? <p className="text-sm text-amber-300">{t('admin.escalation.readOnly')}</p> : null}
          {canWrite ? (
            <button
              className="min-h-11 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => void saveHours.mutate({ hours })}
              type="button"
            >
              {t('admin.escalation.save')}
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'stages' ? (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4" data-testid="escalation-stage-list">
            {ESCALATION_STAGE_KEYS.map((key) => {
              const stage = config.stages.find((entry) => entry.key === key)

              if (stage === undefined) {
                return null
              }

              return (
                <li key={key} className="rounded border p-3 border-slate-700 bg-slate-900">
                  <p className="mb-1 text-sm font-medium text-slate-200">
                    {stageName(key)}
                    {' · '}
                    {stage.active ? t('admin.escalation.stage.on') : t('admin.escalation.stage.off')}
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-400">
                      {t('admin.escalation.stage.nameDe')}
                      <input
                        className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                        disabled={!canWrite}
                        required
                        value={stage.names.de ?? ''}
                        onChange={(event) =>
                          void saveStages.mutate({
                            stages: config.stages.map((entry) =>
                              entry.key === key
                                ? { ...entry, names: { ...entry.names, de: event.target.value } }
                                : entry,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      {t('admin.escalation.stage.nameEn')}
                      <input
                        className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                        disabled={!canWrite}
                        required
                        value={stage.names.en ?? ''}
                        onChange={(event) =>
                          void saveStages.mutate({
                            stages: config.stages.map((entry) =>
                              entry.key === key
                                ? { ...entry, names: { ...entry.names, en: event.target.value } }
                                : entry,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      {t('admin.escalation.stage.active')}
                      <input
                        className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                        checked={stage.active}
                        disabled={!canWrite}
                        type="checkbox"
                        onChange={(event) =>
                          void saveStages.mutate({
                            stages: config.stages.map((entry) =>
                              entry.key === key ? { ...entry, active: event.target.checked } : entry,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>

                  <ul className="flex flex-col gap-3" data-testid={`escalation-rules-${key}`}>
                    {rulesOfStage(key).map((rule) => (
                      <RuleForm
                        key={rule.key}
                        rule={rule}
                        canWrite={canWrite}
                        channels={channelsQuery.data?.channels ?? []}
                        endpointIds={(webhooksQuery.data?.webhooks ?? []).map((entry) => entry.id)}
                        onSave={(next) =>
                          void saveRules.mutate({
                            rules: config.rules.map((entry) => (entry.key === rule.key ? next : entry)),
                          })
                        }
                      />
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>

          {!canWrite ? <p className="text-sm text-amber-300">{t('admin.escalation.readOnly')}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The form of one rule: its key, its reference, its minutes per priority, its
 * condition and its ordered actions (WP-M13-15/16). A rule without a stage is
 * one of the two deadline rules and carries a percentage instead of a clock.
 */
function RuleForm({
  rule,
  canWrite,
  channels,
  endpointIds,
  onSave,
}: {
  rule: EscalationRuleConfig
  canWrite: boolean
  channels: string[]
  endpointIds: string[]
  onSave: (next: EscalationRuleConfig) => void
}) {
  const { t } = useTranslation('settings')
  const [minutes, setMinutes] = useState<EscalationMinutes>(
    rule.minutes ?? { low: 1, normal: 1, high: 1, critical: 1 },
  )

  function apply(next: EscalationRuleConfig) {
    if (escalationRuleConfigSchema.safeParse(next).success) {
      onSave(next)
    }
  }

  return (
    <div className="rounded border p-3 border-slate-700 bg-slate-950/40">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          {t('admin.escalation.rule.key')}
          <input
            className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            required
            value={rule.key}
            onChange={(event) =>
              apply({ ...rule, key: event.target.value })
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.rule.reference')}
          <select
            className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            value={rule.reference ?? ''}
            onChange={(event) => {
              const reference = event.target.value

              if (ESCALATION_REFERENCE_EVENTS.includes(reference as EscalationReferenceEvent)) {
                apply({ ...rule, reference: reference as EscalationReferenceEvent })
              }
            }}
          >
            <option value="">{t('admin.escalation.rule.none')}</option>
            {ESCALATION_REFERENCE_EVENTS.map((event) => (
              <option key={event} value={event}>
                {t(`admin.escalation.rule.referenceEvents.${event}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.rule.percent')}
          <input
            className="w-24 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!canWrite}
            max={100}
            min={1}
            step={1}
            type="number"
            value={rule.percent ?? 0}
            onChange={(event) => apply({ ...rule, percent: Number(event.target.value) })}
          />
        </label>
        {TICKET_PRIORITIES.map((priority) => (
          <label key={priority} className="text-xs text-slate-400">
            {t(`admin.escalation.rule.minutes.${priority}`)}
            <input
              className="w-20 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
              disabled={!canWrite}
              max={10080}
              min={1}
              required
              step={1}
              type="number"
              value={minutes[priority]}
              onChange={(event) => {
                const changed = { ...minutes, [priority]: Number(event.target.value) }

                setMinutes(changed)
                apply({ ...rule, minutes: changed })
              }}
            />
          </label>
        ))}
      </div>

      <EscalationConditionBuilder
        initial={rule.condition}
        canWrite={canWrite}
        onCondition={(next) => apply({ ...rule, condition: next })}
      />

      <EscalationActionEditor
        initial={rule.actions}
        channels={channels}
        endpointIds={endpointIds}
        canWrite={canWrite}
        onActions={(next) => apply({ ...rule, actions: next })}
      />
    </div>
  )
}
