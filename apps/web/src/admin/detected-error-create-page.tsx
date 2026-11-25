import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type { DetectedErrorCreateRequest, DetectedErrorResponse } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { errorMessage, jsonHeaders } from './detected-error-form-parts'
import { AdminLayout } from '../components/admin-layout'

/**
 * The own page of the new detected error (WP-M14-163): the form does not lie
 * above the list of the catalog any more, the list offers a button that opens
 * this page.
 */
export function DetectedErrorCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('settings.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [key, setKey] = useState('')
  const [labelDe, setLabelDe] = useState('')
  const [labelEn, setLabelEn] = useState('')

  const mutation = useMutation({
    mutationFn: (body: DetectedErrorCreateRequest) =>
      apiFetch<DetectedErrorResponse>('/v1/detected-errors', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['detected-errors'] })
      navigate('/admin/detected-errors')
    },
  })

  if (me.isPending) {
    return <p>{t('detectedErrors.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('detectedErrors.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('detectedErrors.forbiddenNotice')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/detected-errors"
      >
        {t('detectedErrors.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('detectedErrors.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ key, labelDe, labelEn })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('detectedErrors.fields.key')}
          <input
            className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
            type="text"
            required
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('detectedErrors.fields.de')}
          <input
            className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
            required
            value={labelDe}
            onChange={(event) => setLabelDe(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('detectedErrors.fields.en')}
          <input
            className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-500/30"
            required
            value={labelEn}
            onChange={(event) => setLabelEn(event.target.value)}
          />
        </label>
        {mutation.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(t, mutation.error)}
          </p>
        ) : null}
        <button
          className="self-start rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('detectedErrors.create')}
        </button>
      </form>
    </AdminLayout>
  )
}
