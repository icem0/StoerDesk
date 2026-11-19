import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ticketStatusKeySchema,
  ticketTransitionEventKeySchema,
  ticketTransitionNotFoundCode,
  type EscalationStageConfig,
  type TicketStatusResponse,
  type TicketTransition,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The transitions of the workflow inside the escalation administration
 * (WP-M14-166, `specs/07-escalation.md` §7.13, ADR-0025).
 *
 * The steps of the workflow are the rows of `ticket_transitions`: the step from
 * one status to another one that an event performs (`fromStatus` → `toStatus`,
 * `eventKey`). The table is the only source of truth of the state machine — an
 * unknown or inactive combination answers `409 invalid_transition` — so it
 * belongs to the levels of the escalation: every group of this editor is one
 * level of the chain with the status the ticket waits in, and the rows of the
 * group are the ways out of that status.
 *
 * The target status is free: a level may lead back into an earlier one (a
 * Rückweg), and a level may be left for a status that no level owns. Nothing
 * of the chain is hard-coded here — the levels and their events come from the
 * escalation configuration, the steps from the API.
 *
 * `settings.read` reads, `settings.write` changes the target status, the
 * active flag, adds a step and removes one. The error codes of the API
 * (`400 invalid_status_key`, `404 transition_not_found`,
 * `409 transition_duplicate`) are named by the editor.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'invalid_status_key',
  ticketTransitionNotFoundCode,
  'transition_duplicate',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.escalation.transitions.errors.${code}`)
}

function useTransitions() {
  return useQuery({
    queryKey: ['ticket-transitions'],
    queryFn: () => apiFetch<{ transitions: TicketTransition[] }>('/v1/admin/transitions'),
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

/** One group: a level of the chain with the status the ticket waits in. */
type TransitionGroup = {
  key: string
  stageKey: string | null
  statusKey: string
  rows: TicketTransition[]
}

/**
 * The level of every status: the level whose events lead to that status. The
 * first level of the chain has no event — the ticket arrives there — so it
 * owns the status the events of its successor start from. A status that no
 * level owns (a terminal status) keeps its own group.
 */
function groupTransitions(
  stages: readonly EscalationStageConfig[],
  transitions: readonly TicketTransition[],
): TransitionGroup[] {
  const stageOfStatus = new Map<string, string>()

  stages.forEach((stage, index) => {
    const events = stage.reachedBy
    const statuses = new Set<string>()

    if (events.length > 0) {
      for (const row of transitions) {
        if (events.includes(row.eventKey)) {
          statuses.add(row.toStatus)
        }
      }
    } else {
      const successor = stages[index + 1]

      for (const row of transitions) {
        if (successor !== undefined && successor.reachedBy.includes(row.eventKey)) {
          statuses.add(row.fromStatus)
        }
      }
    }

    for (const status of statuses) {
      if (!stageOfStatus.has(status)) {
        stageOfStatus.set(status, stage.key)
      }
    }
  })

  const groups: TransitionGroup[] = []
  const grouped = new Set<string>()

  for (const stage of stages) {
    const owned = [...stageOfStatus.entries()]
      .filter(([, owner]) => owner === stage.key)
      .map(([status]) => status)

    for (const status of owned) {
      groups.push({
        key: `${stage.key}:${status}`,
        stageKey: stage.key,
        statusKey: status,
        rows: transitions.filter((row) => row.fromStatus === status),
      })
      grouped.add(status)
    }
  }

  for (const status of new Set(transitions.map((row) => row.fromStatus))) {
    if (grouped.has(status)) {
      continue
    }

    groups.push({
      key: `status:${status}`,
      stageKey: null,
      statusKey: status,
      rows: transitions.filter((row) => row.fromStatus === status),
    })
  }

  return groups
}

export function EscalationTransitions({ stages }: { stages: readonly EscalationStageConfig[] }) {
  const { t, i18n } = useTranslation('settings')
  const canWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const transitionsQuery = useTransitions()
  const statusesQuery = useStatuses()
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [newEventKey, setNewEventKey] = useState('')
  const [newFromStatus, setNewFromStatus] = useState('')
  const [newToStatus, setNewToStatus] = useState('')

  const transitions = useMemo(
    () => transitionsQuery.data?.transitions ?? [],
    [transitionsQuery.data],
  )
  const statuses = useMemo(() => statusesQuery.data?.statuses ?? [], [statusesQuery.data])
  const groups = useMemo(() => groupTransitions(stages, transitions), [stages, transitions])

  const stageNames = useMemo(
    () => new Map(stages.map((stage) => [stage.key, stage.names])),
    [stages],
  )
  const statusNames = useMemo(
    () => new Map(statuses.map((status) => [status.key, status])),
    [statuses],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ticket-transitions'] })
  }

  const updateTransition = useMutation({
    mutationFn: (request: { id: string; body: Partial<TicketTransition> }) =>
      apiFetch<TicketTransition>(`/v1/admin/transitions/${request.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(request.body),
      }),
    onSuccess: invalidate,
  })

  const createTransition = useMutation({
    mutationFn: (body: { fromStatus: string; toStatus: string; eventKey: string }) =>
      apiFetch<TicketTransition>('/v1/admin/transitions', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      setNewEventKey('')
      setNewFromStatus('')
      setNewToStatus('')
    },
  })

  const deleteTransition = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/admin/transitions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  function statusName(key: string): string {
    const status = statusNames.get(key)

    if (status === undefined) {
      return key
    }

    return i18n.language === 'en' ? status.nameEn : status.nameDe
  }

  function stageName(key: string | null): string {
    if (key === null) {
      return t('admin.escalation.transitions.withoutStage')
    }

    const names = stageNames.get(key)

    if (names === undefined) {
      return key
    }

    return names[i18n.language] ?? names.de ?? key
  }

  const newBody = {
    fromStatus: newFromStatus,
    toStatus: newToStatus,
    eventKey: newEventKey,
  }
  const newValid =
    ticketStatusKeySchema.safeParse(newBody.fromStatus).success &&
    ticketStatusKeySchema.safeParse(newBody.toStatus).success &&
    ticketTransitionEventKeySchema.safeParse(newBody.eventKey).success

  const writeError = updateTransition.error ?? createTransition.error ?? deleteTransition.error

  return (
    <section className="flex flex-col gap-4" data-testid="escalation-transitions">
      <p className="text-xs text-slate-500">{t('admin.escalation.transitions.hint')}</p>

      {transitionsQuery.isError || statusesQuery.isError ? (
        <p role="alert" className="text-sm text-rose-400">
          {errorMessage(t, transitionsQuery.error ?? statusesQuery.error)}
        </p>
      ) : null}

      {updateTransition.isError || createTransition.isError || deleteTransition.isError ? (
        <p role="alert" className="text-sm text-rose-400">
          {errorMessage(t, writeError)}
        </p>
      ) : null}

      {transitions.length === 0 ? (
        <p role="alert" className="text-sm text-amber-300">
          {t('admin.escalation.transitions.emptyNotice')}
        </p>
      ) : null}

      {groups.map((group) => (
        <div className="rounded border border-slate-700 bg-slate-900 p-3" key={group.key}>
          <p className="mb-2 text-sm font-medium text-slate-200">
            {stageName(group.stageKey)}
            {' · '}
            {statusName(group.statusKey)}
          </p>
          {group.rows.length === 0 ? (
            <p className="text-xs text-slate-500">{t('admin.escalation.transitions.deadEnd')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {group.rows.map((row) => (
                <li className="flex flex-wrap items-end gap-2" key={row.id}>
                  <span className="text-sm text-slate-200">{row.eventKey}</span>
                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.transitions.fields.toStatus')}
                    <select
                      aria-label={`${t('admin.escalation.transitions.fields.toStatus')} ${row.eventKey}`}
                      className="rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      value={row.toStatus}
                      onChange={(event) =>
                        void updateTransition.mutate({
                          id: row.id,
                          body: { toStatus: event.target.value },
                        })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status.key} value={status.key}>
                          {statusName(status.key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    {t('admin.escalation.transitions.fields.active')}
                    <input
                      aria-label={`${t('admin.escalation.transitions.fields.active')} ${row.eventKey}`}
                      checked={row.active}
                      className="w-16 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                      disabled={!canWrite}
                      type="checkbox"
                      onChange={(event) =>
                        void updateTransition.mutate({
                          id: row.id,
                          body: { active: event.target.checked },
                        })
                      }
                    />
                  </label>
                  {canWrite ? (
                    <button
                      aria-label={`${t('admin.escalation.transitions.delete')} ${row.eventKey}`}
                      className="min-h-11 rounded border border-rose-600 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/40"
                      onClick={() => setRemoveId(row.id)}
                      type="button"
                    >
                      {t('admin.escalation.transitions.delete')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {removeId === group.rows.find((row) => row.id === removeId)?.id ? (
            <div
              className="mt-2 rounded border border-rose-500/60 bg-rose-950/20 p-3 text-sm text-rose-200"
              role="alertdialog"
            >
              <p>{t('admin.escalation.transitions.removeHint')}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="min-h-11 rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
                  onClick={() => {
                    void deleteTransition.mutate(removeId as string)
                    setRemoveId(null)
                  }}
                  type="button"
                >
                  {t('admin.escalation.transitions.removeConfirm')}
                </button>
                <button
                  className="min-h-11 rounded bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
                  onClick={() => setRemoveId(null)}
                  type="button"
                >
                  {t('admin.escalation.transitions.removeCancel')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {canWrite ? (
        <form
          className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
          data-testid="escalation-transition-form"
          onSubmit={(event) => {
            event.preventDefault()

            if (newValid) {
              void createTransition.mutate(newBody)
            }
          }}
        >
          <h3 className="text-lg font-semibold">{t('admin.escalation.transitions.createTitle')}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              {t('admin.escalation.transitions.fields.fromStatus')}
              <select
                className="rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                value={newFromStatus}
                onChange={(event) => setNewFromStatus(event.target.value)}
              >
                <option disabled value="">
                  {t('admin.escalation.transitions.fields.choose')}
                </option>
                {statuses.map((status) => (
                  <option key={status.key} value={status.key}>
                    {statusName(status.key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              {t('admin.escalation.transitions.fields.eventKey')}
              <input
                className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                onChange={(event) => setNewEventKey(event.target.value)}
                value={newEventKey}
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('admin.escalation.transitions.fields.toStatus')}
              <select
                className="rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                value={newToStatus}
                onChange={(event) => setNewToStatus(event.target.value)}
              >
                <option disabled value="">
                  {t('admin.escalation.transitions.fields.choose')}
                </option>
                {statuses.map((status) => (
                  <option key={status.key} value={status.key}>
                    {statusName(status.key)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="min-h-11 rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={!newValid}
              type="submit"
            >
              {t('admin.escalation.transitions.create')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
