import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

import type { BrandingResponse, UpdateBrandingRequest } from '@stoerdesk/shared'
import { DEFAULT_ACCENT_COLOR } from '@stoerdesk/shared'

/**
 * Administration page for the public branding (WP-M2-30). An administrator
 * configures the company name and an optional company logo that is shown next
 * to the name in the shell header (WP-M2-31, WP-M4-09). The logo travels as a
 * base64 data URL inside the `branding` settings row, so every branded view
 * (header, PDF, e-mail) can render it without an extra round trip.
 *
 * Since WP-M14-149e the page also carries the colour of the internal comment,
 * and since WP-M16-02 the **accent colour of the interface** (ADR-0036): both
 * are values of the instance under „Darstellung“, and one save writes the whole
 * row. Since WP-M16-06 each colour also has a **colour picker** beside its hex
 * field: the browser picker of `input type="color"` writes the picked tone into
 * the same state as the hex field, so the colour that was changed last is the
 * colour that is saved. The shell reads the accent colour from the branding
 * request and paints the active menu entry, the links of the settings menu, the
 * focus ring and the unread badge with it.
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

const jsonHeaders = { 'content-type': 'application/json' }

/** At most 500 kB of logo payload (mirrors the server cap). */
const MAX_LOGO_BYTES = 500 * 1024

/** A colour of the form `#rrggbb` — the value of the internal comment. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** The default colour of the internal comment: a dark red (ADR-0034). */
const DEFAULT_INTERNAL_COMMENT_COLOR = '#7f1d1d'

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
  const [color, setColor] = useState<string | null>(null)
  const [colorError, setColorError] = useState<string | null>(null)
  const [accent, setAccent] = useState<string | null>(null)
  const [accentError, setAccentError] = useState<string | null>(null)

  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })

  const currentLogo = branding.data?.logo ?? ''
  const currentColor = color ?? branding.data?.internalCommentColor ?? DEFAULT_INTERNAL_COMMENT_COLOR
  const currentAccent = accent ?? branding.data?.accentColor ?? DEFAULT_ACCENT_COLOR

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
      setAccent(null)
      setAccentError(null)
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
          setColorError(null)
          setAccentError(null)
          const form = new FormData(event.currentTarget)
          const logoToSend =
            logoDataUrl === null ? currentLogo : logoDataUrl
          // A colour comes from the state the picker and the hex field share, so
          // the value that was changed last is the value that is saved (WP-M16-06).
          const colorToSend = currentColor
          const accentToSend = currentAccent

          // A colour that is no hex value never leaves the browser.
          if (!HEX_COLOR.test(colorToSend) || !HEX_COLOR.test(accentToSend)) {
            if (!HEX_COLOR.test(colorToSend)) {
              setColorError(t('branding.errors.colorInvalid'))
            }

            if (!HEX_COLOR.test(accentToSend)) {
              setAccentError(t('branding.errors.colorInvalid'))
            }

            return
          }

          mutation.mutate({
            companyName: String(form.get('companyName') ?? ''),
            titleEnabled: form.get('titleEnabled') === 'on',
            logo: logoToSend,
            internalCommentColor: colorToSend,
            accentColor: accentToSend,
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

        {/* The colour of the internal comment (ADR-0034): the background of the
            field and of the entry in the history of the ticket view. */}
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.field.internalCommentColor')}
          <input
            name="internalCommentColor"
            className="rounded bg-slate-950 p-2 text-slate-100"
            defaultValue={branding.data?.internalCommentColor ?? DEFAULT_INTERNAL_COMMENT_COLOR}
            disabled={!mayWrite}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        {/* The colour picker (WP-M16-06): the browser picks the tone visually and
            writes it into the same state as the hex field above. */}
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.picker.internalCommentColor')}
          <input
            name="internalCommentColorPicker"
            type="color"
            className="inline-block h-11 w-11 rounded border border-slate-700"
            defaultValue={branding.data?.internalCommentColor ?? DEFAULT_INTERNAL_COMMENT_COLOR}
            disabled={!mayWrite}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <p className="text-xs text-slate-400">{t('branding.hintInternalCommentColor')}</p>
        <p className="text-xs text-slate-400">{t('branding.hintPicker')}</p>
        <div
          className="h-8 w-32 rounded border border-slate-700"
          style={{ backgroundColor: currentColor }}
          data-testid="branding-color-swatch"
        />
        {colorError !== null ? (
          <p role="alert" className="text-xs text-rose-400">{colorError}</p>
        ) : null}

        {/* The accent colour of the interface (ADR-0036): the shell carries it
            into `--brand-accent` and paints the active menu entry, the links of
            the settings menu, the focus ring and the unread badge with it. */}
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.field.accentColor')}
          <input
            name="accentColor"
            className="rounded bg-slate-950 p-2 text-slate-100"
            defaultValue={branding.data?.accentColor ?? DEFAULT_ACCENT_COLOR}
            disabled={!mayWrite}
            onChange={(event) => setAccent(event.target.value)}
          />
        </label>
        {/* The accent colour picker (WP-M16-06): the browser picks the tone
            visually and writes it into the same state as the hex field above. */}
        <label className="flex flex-col gap-1 text-sm">
          {t('branding.picker.accentColor')}
          <input
            name="accentColorPicker"
            type="color"
            className="inline-block h-11 w-11 rounded border border-slate-700"
            defaultValue={branding.data?.accentColor ?? DEFAULT_ACCENT_COLOR}
            disabled={!mayWrite}
            onChange={(event) => setAccent(event.target.value)}
          />
        </label>
        <p className="text-xs text-slate-400">{t('branding.hintAccentColor')}</p>
        <p className="text-xs text-slate-400">{t('branding.hintPicker')}</p>
        <div
          className="h-8 w-32 rounded border border-slate-700"
          style={{ backgroundColor: currentAccent }}
          data-testid="branding-accent-swatch"
        />
        {accentError !== null ? (
          <p role="alert" className="text-xs text-rose-400">{accentError}</p>
        ) : null}

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
