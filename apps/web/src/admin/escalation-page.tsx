import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import {
  DEADLINE_HOURS,
  DEFAULT_WORKFLOW_ESCALATION_RULES,
  ESCALATION_REFERENCE_EVENTS,
  TICKET_PRIORITIES,
  escalationFirstStageKey,
  escalationRuleConfigSchema,
  escalationTimerLeaves,
  type DeadlineHours,
  type DeadlineSettings,
  type EscalationConfig,
  type EscalationMinutes,
  type EscalationReferenceEvent,
  type EscalationRuleConfig,
  type EscalationStageConfig,
  type TicketStatusResponse,
  type UserListResponse,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { HelpPopover } from '../components/help-popover'
import { ApiError, apiFetch } from '../lib/api'
import { languagesOf, localizedName } from '../lib/localized-name'
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
 * read-only; the server enforces the permission again. Without `settings.read`
 * the page names the missing permission, an expired session names itself and a
 * configuration that cannot be read answers with the code of the answer — a
 * load that failed is never shown as a failed save.
 *
 * Since WP-M16-19 the stage list follows the rule of `specs/13-ui.md` §14.8
 * (ADR-0043): a stage shows **one** name — the name of the language of the
 * interface — and the actions of the stage sit behind one `…` button. The
 * editor of a stage opens with „Bearbeiten“ and carries the key and one field
 * per language of the stage.
 *
 * The route `/admin/deadlines` redirects here, so old bookmarks keep working.
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const
const handledLoadCodes = [...handledErrorCodes, 'config_invalid'] as const
const jsonHeaders = { 'content-type': 'application/json' }

/**
 * The trigger of an explanation (`specs/13-ui.md` §14.13, ADR-0060, WP-M44-01).
 *
 * The explanations of this page stand behind the ⓘ at their place — the intro
 * of the page is the page-level ⓘ of the shell, the mechanics of the chain, of
 * the clock, of the condition and of the actions sit beside the thing they
 * explain. Only what belongs to a rule stays visible: the read-only notice, the
 * reason of a blocked removal and the error texts.
 */
const popoverClass =
  'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400'

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.escalation.errors.${code}`)
}

/** The message of a configuration that could not be read — never the text of a failed save. */
function loadErrorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledLoadCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'load'

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

function useStatuses() {
  return useQuery({
    queryKey: ['escalation-statuses'],
    queryFn: () => apiFetch<{ statuses: TicketStatusResponse[] }>('/v1/admin/statuses'),
    retry: false,
  })
}

/** The readiness pools a distribution target can name (§7.14, WP-M14-84). */
function usePoolTargets() {
  return useQuery({
    queryKey: ['escalation-pools'],
    queryFn: () => apiFetch<{ pools: { id: string; name: string }[] }>('/v1/oncall/pools'),
    retry: false,
  })
}

/** The user groups a distribution target can name (§7.14, WP-M14-84). */
function useGroupTargets() {
  return useQuery({
    queryKey: ['escalation-groups'],
    queryFn: () => apiFetch<{ groups: { id: string; name: string }[] }>('/v1/groups'),
    retry: false,
  })
}

/** The users a notify target can name (§7.5, WP-M14-90). */
function useUserTargets() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserListResponse>('/v1/users'),
    retry: false,
  })
}

export function EscalationPage() {
  const { t, i18n } = useTranslation('settings')
  const settingsQuery = useDeadlineSettings()
  const configQuery = useEscalationConfig()
  const channelsQuery = useChannelNames()
  const webhooksQuery = useWebhookIds()
  const statusesQuery = useStatuses()
  const poolsQuery = usePoolTargets()
  const groupsQuery = useGroupTargets()
  const usersQuery = useUserTargets()
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')

  const [tab, setTab] = useState('fristen')
  const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null)
  const [savedHours, setSavedHours] = useState<DeadlineHours | null>(null)
  const [savedConfig, setSavedConfig] = useState<EscalationConfig | null>(null)
  const hours = savedHours ?? settingsQuery.data?.hours ?? DEADLINE_HOURS
  const config = savedConfig ?? configQuery.data ?? { stages: [], rules: [] }

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
    onSuccess: (saved) => setSavedConfig({ ...config, stages: (saved as EscalationConfig).stages }),
  })

  if (me.isPending) {
    return <p className="text-slate-400">{t('admin.escalation.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.escalation.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.escalation.forbiddenNotice')}
      </p>
    )
  }

  if (configQuery.isPending) {
    return <p className="text-slate-400">{t('admin.escalation.loading')}</p>
  }

  if (configQuery.isError) {
    return (
      <p role="alert" className="text-rose-400 text-sm">
        {loadErrorMessage(t, configQuery.error)}
      </p>
    )
  }

  const stageNames = new Map<string, Record<string, string>>(
    config.stages.map((stage) => [stage.key, stage.names]),
  )

  function stageName(key: string): string {
    const names = stageNames.get(key)

    return names === undefined ? key : localizedName(names, i18n.language, key)
  }

  const firstStageKey = escalationFirstStageKey(config.stages)
  const stageLabels: Record<string, string> = {}

  for (const stage of config.stages) {
    stageLabels[stage.key] = stageName(stage.key)
  }

  const statusKeys = (statusesQuery.data?.statuses ?? [])
    .filter((status) => status.active)
    .map((status) => status.key)

  const poolTargets = (poolsQuery.data?.pools ?? [])
    .filter((pool) => pool.name.trim() !== '')
    .map((pool) => ({ id: pool.id, name: pool.name }))
  const groupTargets = (groupsQuery.data?.groups ?? [])
    .filter((group) => group.name.trim() !== '')
    .map((group) => ({ id: group.id, name: group.name }))
  const userTargets = (usersQuery.data?.users ?? []).map((user) => ({
    id: user.id,
    name: `${user.givenName} ${user.familyName}`.trim() || user.email,
  }))

  const rulesOfStage = (key: string) => config.rules.filter((rule) => rule.stageKey === key)

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('admin.escalation.title')}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="escalation-tabs">
        <button
          className={`rounded px-3 py-2 text-sm ${tab === 'fristen' ? 'bg-accent-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          onClick={() => setTab('fristen')}
          type="button"
        >
          {t('admin.escalation.tabs.fristen')}
        </button>
        <button
          className={`rounded px-3 py-2 text-sm ${tab === 'stages' ? 'bg-accent-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
          onClick={() => setTab('stages')}
          type="button"
        >
          {t('admin.escalation.tabs.stages')}
        </button>
        {tab === 'fristen' ? (
          <HelpPopover
            className={popoverClass}
            label={t('help:triggerFor', { name: t('admin.escalation.tabs.fristen') })}
            text={t('help:escalation.deadlinesMore')}
          />
        ) : (
          <HelpPopover
            className={popoverClass}
            label={t('help:triggerFor', { name: t('admin.escalation.tabs.stages') })}
            text={t('help:escalation.stagesMore')}
          />
        )}
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
          {!canWrite ? (
            <p className="text-sm text-amber-300">{t('admin.escalation.readOnly')}</p>
          ) : null}
          {canWrite ? (
            <button
              className="min-h-11 rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
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
            {config.stages.map((stage) => {
              const key = stage.key
              const isFirst = stage.key === firstStageKey
              const otherStages = config.stages.filter((entry) => entry.key !== key)

              return (
                <li key={key} className="rounded border p-3 border-slate-700 bg-slate-900">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-200">
                      {stageName(key)}
                      {' · '}
                      {stage.active
                        ? t('admin.escalation.stage.on')
                        : t('admin.escalation.stage.off')}
                    </p>
                    {canWrite ? (
                      <RowMenu
                        items={[
                          {
                            key: 'edit',
                            label: t('admin.escalation.stage.edit'),
                            onSelect: () =>
                              setEditingStageKey(editingStageKey === key ? null : key),
                          },
                          ...(isFirst
                            ? []
                            : [
                                {
                                  key: 'remove',
                                  label: t('admin.escalation.stage.remove'),
                                  tone: 'danger' as const,
                                  onSelect: () => setRemoveCandidate(key),
                                },
                              ]),
                        ]}
                      />
                    ) : null}
                  </div>
                  {editingStageKey === key ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs text-slate-400">
                        {t('admin.escalation.stage.key')}
                        <input
                          className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 read-only:opacity-60"
                          readOnly
                          value={key}
                        />
                      </label>
                      {languagesOf(stage.names).map((locale) => (
                        <label className="text-xs text-slate-400" key={locale}>
                          {locale === 'de'
                            ? t('admin.escalation.stage.nameDe')
                            : locale === 'en'
                              ? t('admin.escalation.stage.nameEn')
                              : locale}
                          <input
                            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                            disabled={!canWrite}
                            required
                            value={stage.names[locale] ?? ''}
                            onChange={(event) =>
                              void saveStages.mutate({
                                stages: config.stages.map((entry) =>
                                  entry.key === key
                                    ? {
                                        ...entry,
                                        names: { ...entry.names, [locale]: event.target.value },
                                      }
                                    : entry,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <label className="text-xs text-slate-400">
                        {t('admin.escalation.stage.predecessor')}
                        <select
                          className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                          disabled={!canWrite || isFirst}
                          value={stage.predecessor ?? ''}
                          onChange={(event) =>
                            void saveStages.mutate({
                              stages: config.stages.map((entry) =>
                                entry.key === key
                                  ? {
                                      ...entry,
                                      predecessor:
                                        event.target.value === '' ? null : event.target.value,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        >
                          <option disabled value="">
                            {t('admin.escalation.stage.predecessorNone')}
                          </option>
                          {otherStages.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {stageName(entry.key)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <HelpPopover
                        className={popoverClass}
                        label={
                          t('help:triggerFor', { name: t('admin.escalation.stage.predecessor') })
                        }
                        text={t('help:escalation.chainMore')}
                      />
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
                                entry.key === key
                                  ? { ...entry, active: event.target.checked }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {removeCandidate === key ? (
                    <div
                      className="mt-3 rounded border border-rose-500/60 bg-rose-950/20 p-3 text-sm text-rose-200"
                      role="alertdialog"
                    >
                      <p>{t('admin.escalation.stage.removeHint')}</p>
                      <p className="mt-1 text-xs text-rose-300">
                        {t('admin.escalation.stage.removeRules')}
                        {': '}
                        {rulesOfStage(key)
                          .map((rule) => rule.key)
                          .join(', ') || '—'}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="min-h-11 rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
                          onClick={() => {
                            void saveStages.mutate({
                              stages: config.stages.filter((entry) => entry.key !== key),
                            })
                            setRemoveCandidate(null)
                          }}
                          type="button"
                        >
                          {t('admin.escalation.stage.removeConfirm')}
                        </button>
                        <button
                          className="min-h-11 rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
                          onClick={() => setRemoveCandidate(null)}
                          type="button"
                        >
                          {t('admin.escalation.stage.removeCancel')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ul className="flex flex-col gap-3" data-testid={`escalation-rules-${key}`}>
                    {rulesOfStage(key).map((rule) => (
                      <RuleForm
                        key={rule.key}
                        rule={rule}
                        canWrite={canWrite}
                        channels={channelsQuery.data?.channels ?? []}
                        endpointIds={(webhooksQuery.data?.webhooks ?? []).map((entry) => entry.id)}
                        statuses={statusKeys}
                        pools={poolTargets}
                        groups={groupTargets}
                        users={userTargets}
                        stageNames={stageLabels}
                        onSave={(next) =>
                          void saveRules.mutate({
                            rules: config.rules.map((entry) =>
                              entry.key === rule.key ? next : entry,
                            ),
                          })
                        }
                      />
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>

          {canWrite ? (
            <Link
              className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              to="/admin/escalation/stages/new"
            >
              {t('admin.escalation.stage.add')}
            </Link>
          ) : null}

          {saveStages.isError ? (
            <p role="alert" className="text-sm text-rose-400">
              {t('admin.escalation.errors.stageChainInvalid')}
            </p>
          ) : null}

          {!canWrite ? (
            <p className="text-sm text-amber-300">{t('admin.escalation.readOnly')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

const stageKeyPattern = /^[a-z][a-z0-9_]{0,39}$/

/** The add row of the stage tab: a new stage joins the chain (WP-M14-65). */
export function AddStageForm({
  stages,
  onAdd,
}: {
  stages: EscalationStageConfig[]
  onAdd: (stage: EscalationStageConfig) => void
}) {
  const { t } = useTranslation('settings')
  const nextPosition = Math.min(20, Math.max(0, ...stages.map((stage) => stage.position)) + 1)
  const [key, setKey] = useState('')
  const [nameDe, setNameDe] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [position, setPosition] = useState(String(nextPosition))
  const [active, setActive] = useState(true)
  const [predecessor, setPredecessor] = useState(() => {
    const last = stages.reduce<EscalationStageConfig | undefined>(
      (best, stage) => (best === undefined || stage.position > best.position ? stage : best),
      undefined,
    )

    return last?.key ?? ''
  })
  const [invalid, setInvalid] = useState(false)

  const positionValue = Number(position)
  const valid =
    stageKeyPattern.test(key) &&
    nameDe.trim() !== '' &&
    nameEn.trim() !== '' &&
    predecessor !== '' &&
    Number.isInteger(positionValue) &&
    positionValue >= 1 &&
    positionValue <= 20

  function submit(event: FormEvent) {
    event.preventDefault()

    if (!valid) {
      setInvalid(true)
      return
    }

    setInvalid(false)
    onAdd({
      key,
      names: { de: nameDe.trim(), en: nameEn.trim() },
      position: positionValue,
      active,
      predecessor,
      reachedBy: [],
    })
    setKey('')
    setNameDe('')
    setNameEn('')
    setActive(true)
    setPosition(
      String(
        Math.min(20, Math.max(0, ...stages.map((stage) => stage.position), positionValue) + 1),
      ),
    )
  }

  return (
    <form
      className="rounded border border-dashed p-3 border-slate-600 bg-slate-900/60"
      data-testid="escalation-stage-add"
      onSubmit={submit}
    >
      <p className="mb-2 text-sm font-medium text-slate-200">{t('admin.escalation.stage.add')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.key')}
          <input
            className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100"
            required
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.nameDe')}
          <input
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100"
            required
            value={nameDe}
            onChange={(event) => setNameDe(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.nameEn')}
          <input
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100"
            required
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.position')}
          <input
            className="w-20 rounded bg-slate-950 p-2 text-sm text-slate-100"
            max={20}
            min={1}
            required
            step={1}
            type="number"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.predecessor')}
          <select
            className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100"
            value={predecessor}
            onChange={(event) => setPredecessor(event.target.value)}
          >
            {stages.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.names.de ?? stage.key}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          {t('admin.escalation.stage.active')}
          <input
            checked={active}
            type="checkbox"
            onChange={(event) => setActive(event.target.checked)}
          />
        </label>
        <button
          className="min-h-11 rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          type="submit"
        >
          {t('admin.escalation.stage.addConfirm')}
        </button>
      </div>
      {invalid ? (
        <p className="mt-2 text-sm text-rose-400" role="alert">
          {t('admin.escalation.stage.addInvalid')}
        </p>
      ) : null}
    </form>
  )
}

/**
 * The minutes of a rule before the server answer (WP-M14-135): the seeded rule
 * of the same key, otherwise the first seeded stage rule. The values come from
 * the shared seed, so this fallback cannot drift from ADR-0008.
 */
function seededMinutesFor(ruleKey: string): EscalationMinutes {
  // The seed carries its minutes in the timer of its condition (ADR-0064).
  const minutesOf = (entry: (typeof DEFAULT_WORKFLOW_ESCALATION_RULES)[number]) =>
    escalationTimerLeaves(entry.condition).flatMap((timer) =>
      'minutes' in timer.value ? [timer.value.minutes] : [],
    )[0]
  const exact = DEFAULT_WORKFLOW_ESCALATION_RULES.find((entry) => entry.key === ruleKey)

  if (exact !== undefined && minutesOf(exact) !== undefined) {
    return minutesOf(exact) as EscalationMinutes
  }

  for (const entry of DEFAULT_WORKFLOW_ESCALATION_RULES) {
    const minutes = minutesOf(entry)

    if (minutes !== undefined) {
      return minutes
    }
  }

  throw new Error('the escalation seed carries no stage rule')
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
  statuses,
  pools,
  groups,
  users,
  stageNames,
  onSave,
}: {
  rule: EscalationRuleConfig
  canWrite: boolean
  channels: string[]
  endpointIds: string[]
  statuses: string[]
  pools: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  users: { id: string; name: string }[]
  stageNames: Record<string, string>
  onSave: (next: EscalationRuleConfig) => void
}) {
  const { t } = useTranslation('settings')
  const [minutes, setMinutes] = useState<EscalationMinutes>(
    rule.minutes ?? seededMinutesFor(rule.key),
  )

  function apply(next: EscalationRuleConfig) {
    if (escalationRuleConfigSchema.safeParse(next).success) {
      onSave(next)
    }
  }

  return (
    <div className="rounded border p-3 border-slate-700 bg-slate-950/40">
      <fieldset
        className="rounded border border-slate-700 p-3"
        data-testid="escalation-rule-timeline"
      >
        <legend className="px-1 text-xs font-medium text-slate-300">
          <span className="inline-flex items-center gap-1 align-middle">
            {t('admin.escalation.rule.timeline')}
            <HelpPopover
              className={`${popoverClass} -my-3`}
              label={t('help:triggerFor', { name: t('admin.escalation.rule.timeline') })}
              text={t('help:escalation.timelineMore')}
            />
          </span>
        </legend>
        <div className="flex flex-wrap items-end gap-2">
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
          <HelpPopover
            className={popoverClass}
            label={t('help:triggerFor', { name: t('admin.escalation.rule.reference') })}
            text={t('help:escalation.referenceMore')}
          />
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
      </fieldset>

      <section className="mt-4 flex flex-col gap-2">
        <header className="flex items-center gap-1">
          <h3 className="text-xs font-medium text-slate-300">
            {t('admin.escalation.condition.modeLabel')}
          </h3>
          <HelpPopover
            className={`${popoverClass} -my-3`}
            label={t('help:triggerFor', { name: t('admin.escalation.condition.modeLabel') })}
            text={t('help:escalation.conditionMore')}
          />
        </header>
        <EscalationConditionBuilder
          initial={rule.condition}
          canWrite={canWrite}
          stageNames={stageNames}
          pools={pools}
          onCondition={(next) => apply({ ...rule, condition: next })}
        />
      </section>

      <section className="mt-4 flex flex-col gap-2">
        <header className="flex items-center gap-1">
          <h3 className="text-xs font-medium text-slate-300">
            {t('admin.escalation.rule.actions')}
          </h3>
          <HelpPopover
            className={`${popoverClass} -my-3`}
            label={t('help:triggerFor', { name: t('admin.escalation.rule.actions') })}
            text={t('help:escalation.actionsMore')}
          />
        </header>
        <EscalationActionEditor
          initial={rule.actions}
          channels={channels}
          endpointIds={endpointIds}
          statuses={statuses}
          pools={pools}
          groups={groups}
          users={users}
          canWrite={canWrite}
          onActions={(next) => apply({ ...rule, actions: next })}
        />
      </section>
    </div>
  )
}
