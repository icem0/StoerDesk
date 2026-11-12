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
 * configures the company name and an optional company logo that is shown next
 * to the name in the shell header (WP-M2-31, WP-M4-09). The logo travels as a
 * base64 data URL inside the `branding` settings row, so every branded view
 * (header, PDF, e-mail) can render it without an extra round trip.
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

const jsonHeaders = { 'content-type': 'application/json' }

/** At most 500 kB of logo payload (mirrors the server cap). */
const MAX_LOGO_BYTES = 500 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  const fields =
    error instanceof ApiError && error.params && Array.isArray(error.params.fields)
      ? (error.params.fields as string[])
      : []

  if (code === 'invalid_request' && fields.includes('logo')) {
    return t('branding.errors.logoInvalid')
  }

  return t(`branding.errors.${code}`)
}

export function BrandingPage() {
  const { t } = useTranslation('common')
  const me = useMe()
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [titleEnabled, setTitleEnabled] = useState<boolean | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })

  const currentLogo = branding.data?.logo ?? ''

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
      setTitleEnabled(null)
      setLogoDataUrl(null)
      setLogoError(null)
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
        to="/settings"
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
          setLogoError(null)
          const form = new FormData(event.currentTarget)
          const logoToSend =
            logoDataUrl === null ? currentLogo : logoDataUrl
          mutation.mutate({
            companyName: String(form.get('companyName') ?? ''),
            titleEnabled: form.get('titleEnabled') === 'on',
            logo: logoToSend,
          })
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
        <p className="text-xs text-slate-400">{t('branding.hintTitleEnabled')}</p>
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.field.titleEnabled')}
          <input
            name="titleEnabled"
            className="rounded bg-slate-950 p-2 text-slate-100"
            checked={titleEnabled ?? branding.data?.titleEnabled === true}
            disabled={!mayWrite}
            onChange={(event) => setTitleEnabled(event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t('branding.field.logo')}
          <input
            accept="image/jpeg,image/png"
            disabled={!mayWrite || mutation.isPending}
            onChange={(event) => {
              setLogoError(null)
              const file = event.target.files?.[0] ?? null
              if (file === null) {
                setLogoDataUrl(null)
                return
              }
              if (
                !file.type.includes('jpeg') &&
                !file.type.includes('png')
              ) {
                setLogoError(t('branding.errors.logoInvalid'))
                setLogoDataUrl(null)
                return
              }
              if (file.size > MAX_LOGO_BYTES) {
                setLogoError(t('branding.errors.logoInvalid'))
                setLogoDataUrl(null)
                return
              }
              void readAsDataUrl(file).then((dataUrl) => {
                setLogoError(null)
                setLogoDataUrl(dataUrl)
              })
            }}
            type="file"
          />
        </label>
        <p className="text-xs text-slate-400">{t('branding.hintLogo')}</p>

        {currentLogo && !logoDataUrl && (
          <div className="flex items-center gap-2">
            <img
              src={currentLogo}
              alt={t('branding.field.logo')}
              className="h-10 w-auto rounded border border-slate-700 bg-slate-800"
            />
            <button
              type="button"
              disabled={!mayWrite || mutation.isPending}
              className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              onClick={() => {
                setLogoError(null)
                setLogoDataUrl('')
              }}
            >
              {t('branding.logoRemove')}
            </button>
          </div>
        )}
        {logoDataUrl !== null && logoDataUrl !== '' && (
          <div className="flex items-center gap-2">
            <img
              src={logoDataUrl}
              alt={t('branding.field.logo')}
              className="h-10 w-auto rounded border border-sky-500 bg-slate-800"
            />
          </div>
        )}
        {logoError !== null && (
          <p role="alert" className="text-xs text-rose-400">{logoError}</p>
        )}
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
