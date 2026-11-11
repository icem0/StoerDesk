import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import {
  ESCALATION_STAGE_KEY_PATTERN,
  type EscalationStage,
  type EscalationStages,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Escalation-stage administration (`specs/07-escalation.md` §7.5, WP-M12-04).
 *
 * The array order is the escalation order and is changed by drag and drop. The
 * server enforces `settings.read`/`settings.write`; without the write permission
 * the page stays read-only.
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

  return t(`admin.escalationStages.errors.${code}`)
}

function useEscalationStages() {
  return useQuery({
    queryKey: ['escalation-stages-admin'],
    queryFn: () => apiFetch<EscalationStages>('/v1/settings/escalation-stages'),
    retry: false,
  })
}

function reorder(stages: EscalationStage[], from: number, to: number): EscalationStage[] {
  const next = [...stages]
  const [moved] = next.splice(from, 1)

  if (moved === undefined) {
    return stages
  }

  next.splice(to, 0, moved)

  return next
}

function StageForm({ initial, canWrite }: { initial: EscalationStages; canWrite: boolean }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [stages, setStages] = useState<EscalationStage[]>(initial.stages)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: (body: EscalationStages) =>
      apiFetch<EscalationStages>('/v1/settings/escalation-stages', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      setStages(saved.stages)
      queryClient.setQueryData(['escalation-stages-admin'], saved)
    },
  })

  function updateStage(index: number, patch: Partial<EscalationStage>) {
    setStages((current) =>
      current.map((stage, position) => (position === index ? { ...stage, ...patch } : stage)),
    )
  }

  function updateName(index: number, locale: string, value: string) {
    setStages((current) =>
      current.map((stage, position) =>
        position === index ? { ...stage, names: { ...stage.names, [locale]: value } } : stage,
      ),
    )
  }

  function addStage() {
    setStages((current) => [
      ...current,
      {
        key: `stage_${current.length + 1}`,
        names: { de: '', en: '' },
        deadlineMinutes: 15,
      },
    ])
  }

  const valid =
    stages.length > 0 &&
    stages.every(
      (stage) =>
        ESCALATION_STAGE_KEY_PATTERN.test(stage.key) &&
        (stage.names.de ?? '').trim() !== '' &&
        (stage.names.en ?? '').trim() !== '',
    )

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()

        if (valid) {
          mutation.mutate({ stages })
        }
      }}
    >
      <p className="text-sm text-slate-400">{t('admin.escalationStages.orderHint')}</p>

      <ol className="flex flex-col gap-2" data-testid="escalation-stage-list">
        {stages.map((stage, index) => (
          <li
            key={`${stage.key}-${index}`}
            draggable={canWrite}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              if (canWrite) {
                event.preventDefault()
              }
            }}
            onDrop={(event) => {
              event.preventDefault()

              if (canWrite && dragIndex !== null && dragIndex !== index) {
                setStages((current) => reorder(current, dragIndex, index))
              }

              setDragIndex(null)
            }}
            className={`rounded border p-3 ${
              dragIndex === index
                ? 'border-sky-500 bg-slate-800'
                : 'border-slate-700 bg-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-end gap-3">
              <span
                className="cursor-grab select-none self-center text-slate-500"
                aria-hidden="true"
                title={t('admin.escalationStages.dragHandle')}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="7" cy="4" r="1.5" />
                  <circle cx="13" cy="4" r="1.5" />
                  <circle cx="7" cy="10" r="1.5" />
                  <circle cx="13" cy="10" r="1.5" />
                  <circle cx="7" cy="16" r="1.5" />
                  <circle cx="13" cy="16" r="1.5" />
                </svg>
              </span>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t('admin.escalationStages.fields.key')}
                <input
                  className="w-40 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  required
                  value={stage.key}
                  onChange={(event) => updateStage(index, { key: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t('admin.escalationStages.fields.nameDe')}
                <input
                  className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  required
                  value={stage.names.de ?? ''}
                  onChange={(event) => updateName(index, 'de', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t('admin.escalationStages.fields.nameEn')}
                <input
                  className="w-48 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                  disabled={!canWrite}
                  required
                  value={stage.names.en ?? ''}
                  onChange={(event) => updateName(index, 'en', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t('admin.escalationStages.fields.deadline')}
                <span className="flex items-center gap-2">
                  <input
                    className="w-24 rounded bg-slate-950 p-2 text-sm text-slate-100 disabled:opacity-60"
                    disabled={!canWrite}
                    max={10080}
                    min={1}
                    required
                    step={1}
                    type="number"
                    value={stage.deadlineMinutes}
                    onChange={(event) =>
                      updateStage(index, { deadlineMinutes: Number(event.target.value) })
                    }
                  />
                  <span className="text-slate-400">{t('admin.escalationStages.unit.minutes')}</span>
                </span>
              </label>
              {canWrite ? (
                <button
                  className="ml-auto rounded bg-rose-800 px-3 py-2 text-sm text-rose-100 hover:bg-rose-700 disabled:opacity-50"
                  disabled={stages.length <= 1}
                  onClick={() => setStages((current) => current.filter((_, pos) => pos !== index))}
                  type="button"
                >
                  {t('admin.escalationStages.remove')}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {!canWrite ? <p className="text-sm text-amber-300">{t('admin.escalationStages.readOnly')}</p> : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p className="text-sm text-emerald-300">{t('admin.escalationStages.saved')}</p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-600"
            onClick={addStage}
            type="button"
          >
            {t('admin.escalationStages.add')}
          </button>
          <button
            className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={mutation.isPending || !valid}
            type="submit"
          >
            {t('admin.escalationStages.save')}
          </button>
        </div>
      ) : null}
    </form>
  )
}

export function EscalationStagesPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const stages = useEscalationStages()

  if (me.isPending) {
    return <p>{t('admin.escalationStages.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.escalationStages.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.escalationStages.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.escalationStages.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.escalationStages.hint')}</p>

      {stages.isPending ? <p className="mt-4">{t('admin.escalationStages.loading')}</p> : null}
      {stages.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {errorMessage(t, stages.error)}
        </p>
      ) : null}
      {stages.data !== undefined ? (
        <StageForm
          key={stages.dataUpdatedAt}
          initial={stages.data}
          canWrite={canWrite}
        />
      ) : null}
    </main>
  )
}
