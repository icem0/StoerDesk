import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

import type { BrandingResponse, UpdateBrandingRequest } from '@stoerdesk/shared'

/**
 * Administration page for the public branding (WP-M2-30). An administrator
 * configures the company name that is shown next to the logo in the shell
 * header (WP-M2-31). The server guard (`settings.write`) is the only
 * enforcement point; the UI hides the save button without the permission.
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`branding.errors.${code}`)
}

export function BrandingPage() {
  const { t } = useTranslation('common')
  const me = useMe()
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (body: UpdateBrandingRequest) =>
      apiFetch<BrandingResponse>('/v1/settings/branding', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branding'] })
      setSaved(true)
    },
  })

  if (me.isPending) {
    return <p>{t('auth.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-400">
        {t('auth.errors.session_invalid')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 sm:p-8 text-slate-100">
      <Link
        className="mt-6 inline-block rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin"
      >
        {t('branding.back')}
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">{t('branding.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">{t('branding.hint')}</p>

      {branding.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, branding.error)}
        </p>
      ) : null}

      {saved ? (
        <p className="mt-4 text-sm text-emerald-400">{t('branding.saved')}</p>
      ) : null}

      <form
        className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          mutation.mutate({ companyName: String(form.get('companyName') ?? ''), titleEnabled: false })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.field.companyName')}
          <input
            name="companyName"
            className="rounded bg-slate-950 p-2 text-slate-100"
            defaultValue={branding.data?.companyName ?? ''}
            disabled={!mayWrite}
          />
        </label>
        {mutation.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(t, mutation.error)}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={!mayWrite || mutation.isPending}
            type="submit"
          >
            {t('branding.save')}
          </button>
        </div>
      </form>
    </main>
  )
}
