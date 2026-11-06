import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import { TICKET_PRIORITIES, type DeadlineSettings, type TicketPriority } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Deadline administration (`specs/05-timeline.md` §5.1, ADR-0008, WP-M6-15).
 *
 * Four deadline hours (one per priority) and the four reaction minutes, each with
 * a standard and a critical value. The server enforces `settings.read` and
 * `settings.write`; without the write permission the inputs stay read-only.
 */

const REACTION_RULES = [
  'new_without_review',
  'work_order_without_distribution',
  'offered_without_claim',
  'assigned_without_accept',
] as const

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.deadlines.errors.${code}`)
}

function useDeadlineSettings() {
  return useQuery({
    queryKey: ['deadline-settings'],
    queryFn: () => apiFetch<DeadlineSettings>('/v1/settings/deadlines'),
    retry: false,
  })
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <input
      aria-label={label}
      className="w-28 rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-60"
      disabled={disabled}
      max={max}
      min={min}
      required
      step={1}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

function DeadlineForm({ initial, canWrite }: { initial: DeadlineSettings; canWrite: boolean }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<DeadlineSettings>(initial)

  const mutation = useMutation({
    mutationFn: (body: DeadlineSettings) =>
      apiFetch<DeadlineSettings>('/v1/settings/deadlines', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['deadline-settings'], saved)
    },
  })

  function setHours(priority: TicketPriority, hours: number) {
    setValues({ ...values, hours: { ...values.hours, [priority]: hours } })
  }

  function setReaction(
    rule: (typeof REACTION_RULES)[number],
    field: 'standard' | 'critical',
    minutes: number,
  ) {
    setValues({
      ...values,
      reactionMinutes: {
        ...values.reactionMinutes,
        [rule]: { ...values.reactionMinutes[rule], [field]: minutes },
      },
    })
  }

  return (
    <form
      className="mt-6 flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate(values)
      }}
    >
      <fieldset className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4">
        <legend className="px-1 text-lg font-semibold">{t('admin.deadlines.hoursTitle')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TICKET_PRIORITIES.map((priority) => (
            <label key={priority} className="flex items-center justify-between gap-3 text-sm">
              <span>{t(`admin.deadlines.priority.${priority}`)}</span>
              <span className="flex items-center gap-2">
                <NumberField
                  label={`${t(`admin.deadlines.priority.${priority}`)} (${t('admin.deadlines.hoursTitle')})`}
                  disabled={!canWrite}
                  min={1}
                  max={8760}
                  value={values.hours[priority]}
                  onChange={(hours) => setHours(priority, hours)}
                />
                <span className="text-slate-400">{t('admin.deadlines.unit.hours')}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4">
        <legend className="px-1 text-lg font-semibold">{t('admin.deadlines.reactionTitle')}</legend>
        <p className="text-sm text-slate-400">{t('admin.deadlines.reactionHint')}</p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              <th className="py-2 font-medium">{t('admin.deadlines.rule')}</th>
              <th className="py-2 font-medium">{t('admin.deadlines.standard')}</th>
              <th className="py-2 font-medium">{t('admin.deadlines.critical')}</th>
            </tr>
          </thead>
          <tbody>
            {REACTION_RULES.map((rule) => (
              <tr key={rule} className="border-t border-slate-800">
                <td className="py-2 pr-3">{t(`admin.deadlines.rules.${rule}`)}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <NumberField
                      label={`${t(`admin.deadlines.rules.${rule}`)} (${t('admin.deadlines.standard')})`}
                      disabled={!canWrite}
                      min={1}
                      max={10080}
                      value={values.reactionMinutes[rule].standard}
                      onChange={(minutes) => setReaction(rule, 'standard', minutes)}
                    />
                    <span className="text-slate-400">{t('admin.deadlines.unit.minutes')}</span>
                  </span>
                </td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <NumberField
                      label={`${t(`admin.deadlines.rules.${rule}`)} (${t('admin.deadlines.critical')})`}
                      disabled={!canWrite}
                      min={1}
                      max={10080}
                      value={values.reactionMinutes[rule].critical}
                      onChange={(minutes) => setReaction(rule, 'critical', minutes)}
                    />
                    <span className="text-slate-400">{t('admin.deadlines.unit.minutes')}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      {!canWrite ? <p className="text-sm text-amber-300">{t('admin.deadlines.readOnly')}</p> : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p className="text-sm text-emerald-300">{t('admin.deadlines.saved')}</p>
      ) : null}
      {canWrite ? (
        <button
          className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={mutation.isPending}
          type="submit"
        >
          {t('admin.deadlines.save')}
        </button>
      ) : null}
    </form>
  )
}

export function DeadlinesPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const settings = useDeadlineSettings()

  if (me.isPending) {
    return <p>{t('admin.deadlines.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.deadlines.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.deadlines.forbiddenNotice')}
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
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.deadlines.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.deadlines.hint')}</p>

      {settings.isPending ? <p className="mt-4">{t('admin.deadlines.loading')}</p> : null}
      {settings.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {errorMessage(t, settings.error)}
        </p>
      ) : null}
      {settings.data !== undefined ? (
        <DeadlineForm key={settings.dataUpdatedAt} initial={settings.data} canWrite={canWrite} />
      ) : null}
    </main>
  )
}
