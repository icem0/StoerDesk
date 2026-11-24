import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

import {
  DEFAULT_STICKER_TEMPLATE,
  STICKER_TEMPLATE_PRESETS,
  stickerGeometryOverflow,
  type StickerAppearance,
  type StickerGeometry,
  type StickerSheetFormat,
  type StickerTemplate,
  type StickerTemplateResponse,
  type UpdateStickerTemplateRequest,
} from '@stoerdesk/shared'

/**
 * The administration of the sticker template of the installation (ADR-0050,
 * WP-M27-03).
 *
 * The office labels its objects with the stickers of a label roll. The sheet
 * format, the grid, the size of the label and the look of the label are
 * therefore a setting of the installation and not a constant of the app: the
 * page edits the geometry (sheet format, columns, rows, label size, margins,
 * the distance between the labels) and the appearance (error correction and
 * size of the QR, the lines that are printed).
 *
 * The catalog of the sheets is data (`STICKER_TEMPLATE_PRESETS`); the free grid
 * takes every other measure of the label roll of the office over. A geometry
 * that does not fit on its sheet is refused by the page and by the server —
 * the field that does not fit is named.
 *
 * The 112 notice is not part of the appearance: it stays visible on every
 * sticker (`PLAN.md` §2).
 */

const handledErrorCodes = ['session_invalid', 'forbidden', 'invalid_request'] as const

const jsonHeaders = { 'content-type': 'application/json' }

const GEOMETRY_FIELDS = [
  { name: 'columns', step: 1 },
  { name: 'rows', step: 1 },
  { name: 'labelWidthMm', step: 0.1 },
  { name: 'labelHeightMm', step: 0.1 },
  { name: 'marginTopMm', step: 0.1 },
  { name: 'marginRightMm', step: 0.1 },
  { name: 'marginBottomMm', step: 0.1 },
  { name: 'marginLeftMm', step: 0.1 },
  { name: 'gapXMm', step: 0.1 },
  { name: 'gapYMm', step: 0.1 },
] as const

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`stickerTemplate.errors.${code}`)
}

export function StickerTemplatePage() {
  const { t } = useTranslation('common')
  const me = useMe()
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<StickerTemplate | null>(null)
  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['sticker-template'],
    queryFn: () => apiFetch<StickerTemplateResponse>('/v1/settings/sticker-template'),
    retry: false,
  })

  const template = draft ?? query.data?.template ?? DEFAULT_STICKER_TEMPLATE
  const overflow = stickerGeometryOverflow(template.geometry)

  const mutation = useMutation({
    mutationFn: (body: UpdateStickerTemplateRequest) =>
      apiFetch<StickerTemplateResponse>('/v1/settings/sticker-template', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sticker-template'] })
      setDraft(null)
      setSaved(true)
    },
  })

  function updateGeometry(patch: Partial<StickerGeometry>) {
    setSaved(false)
    setDraft({ ...template, geometry: { ...template.geometry, ...patch } })
  }

  function updateAppearance(patch: Partial<StickerAppearance>) {
    setSaved(false)
    setDraft({ ...template, appearance: { ...template.appearance, ...patch } })
  }

  function choosePreset(key: string) {
    setSaved(false)

    if (key === 'custom') {
      setDraft({ ...template, templateKey: 'custom' })
      return
    }

    const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === key)

    if (preset === undefined) {
      return
    }

    setDraft({ ...template, templateKey: preset.key, geometry: preset.geometry })
  }

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
        {t('stickerTemplate.back')}
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">{t('stickerTemplate.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">{t('stickerTemplate.hint')}</p>

      {query.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, query.error)}
        </p>
      ) : null}

      {saved ? (
        <p className="mt-4 text-sm text-emerald-400">{t('stickerTemplate.saved')}</p>
      ) : null}

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()

          if (overflow.length > 0) {
            return
          }

          mutation.mutate({
            templateKey: template.templateKey,
            geometry: template.geometry,
            appearance: template.appearance,
          })
        }}
      >
        <fieldset className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-4">
          <legend className="px-2 text-sm font-medium">{t('stickerTemplate.section.sheet')}</legend>

          <label className="flex flex-col gap-1 text-sm">
            {t('stickerTemplate.field.preset')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              value={template.templateKey}
              disabled={!mayWrite}
              onChange={(event) => choosePreset(event.target.value)}
            >
              {STICKER_TEMPLATE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {t(`stickerTemplate.preset.${preset.key}`)}
                </option>
              ))}
              <option value="custom">{t('stickerTemplate.preset.custom')}</option>
            </select>
          </label>
          <p className="text-xs text-slate-400">{t('stickerTemplate.hintPreset')}</p>

          <label className="flex flex-col gap-1 text-sm">
            {t('stickerTemplate.field.page')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              value={template.geometry.page}
              disabled={!mayWrite}
              onChange={(event) =>
                updateGeometry({ page: event.target.value as StickerSheetFormat })
              }
            >
              <option value="a4">{t('stickerTemplate.page.a4')}</option>
              <option value="a6">{t('stickerTemplate.page.a6')}</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GEOMETRY_FIELDS.map((field) => (
              <label key={field.name} className="flex flex-col gap-1 text-sm">
                {t(`stickerTemplate.field.${field.name}`)}
                <input
                  className="rounded bg-slate-950 p-2 text-slate-100"
                  type="number"
                  step={field.step}
                  min={0}
                  value={template.geometry[field.name]}
                  disabled={!mayWrite}
                  onChange={(event) =>
                    updateGeometry({ [field.name]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
          </div>

          {overflow.length > 0 ? (
            <p role="alert" className="text-xs text-rose-400">
              {t('stickerTemplate.errors.doesNotFit')}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-4">
          <legend className="px-2 text-sm font-medium">{t('stickerTemplate.section.look')}</legend>

          <label className="flex flex-col gap-1 text-sm">
            {t('stickerTemplate.field.qrLevel')}
            <select
              className="rounded bg-slate-950 p-2 text-slate-100"
              value={template.appearance.qrLevel}
              disabled={!mayWrite}
              onChange={(event) =>
                updateAppearance({ qrLevel: event.target.value as StickerAppearance['qrLevel'] })
              }
            >
              {(['L', 'M', 'Q', 'H'] as const).map((level) => (
                <option key={level} value={level}>
                  {t(`stickerTemplate.qrLevel.${level}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-400">{t('stickerTemplate.hintQrLevel')}</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={template.appearance.qrSizeMm === null}
              disabled={!mayWrite}
              onChange={(event) =>
                updateAppearance({ qrSizeMm: event.target.checked ? null : 30 })
              }
            />
            {t('stickerTemplate.field.qrSizeAutomatic')}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('stickerTemplate.field.qrSizeMm')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="number"
              step={0.5}
              min={8}
              value={template.appearance.qrSizeMm ?? ''}
              disabled={!mayWrite || template.appearance.qrSizeMm === null}
              onChange={(event) =>
                updateAppearance({ qrSizeMm: Number(event.target.value) })
              }
            />
          </label>
          <p className="text-xs text-slate-400">{t('stickerTemplate.hintQrSize')}</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={template.appearance.showName}
              disabled={!mayWrite}
              onChange={(event) => updateAppearance({ showName: event.target.checked })}
            />
            {t('stickerTemplate.field.showName')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={template.appearance.showObjectNo}
              disabled={!mayWrite}
              onChange={(event) => updateAppearance({ showObjectNo: event.target.checked })}
            />
            {t('stickerTemplate.field.showObjectNo')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={template.appearance.showCallText}
              disabled={!mayWrite}
              onChange={(event) => updateAppearance({ showCallText: event.target.checked })}
            />
            {t('stickerTemplate.field.showCallText')}
          </label>

          <p className="text-xs text-slate-400">{t('stickerTemplate.hintEmergencyNotice')}</p>
        </fieldset>

        {mutation.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(t, mutation.error)}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={!mayWrite || mutation.isPending || overflow.length > 0}
            type="submit"
          >
            {t('stickerTemplate.save')}
          </button>
        </div>
      </form>
    </main>
  )
}
