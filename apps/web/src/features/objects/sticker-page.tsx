import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ObjectListResponse, ObjectSummary, StickerTemplate } from '@stoerdesk/shared'
import {
  DEFAULT_STICKER_TEMPLATE,
  STICKER_TEMPLATE_PRESETS,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { StickerSheet } from './sticker-sheet'

/**
 * The printable QR stickers (`specs/08-objects-api.md` §9.3, ADR-0050).
 *
 * The page lists the objects of the list API as a checklist and prints them on
 * the sheet of the chosen format. The **look** of the sticker is the setting of
 * the installation (`GET /api/v1/settings/sticker-template`): the print job
 * chooses the sheet, not the look. The sheet of the print is built from the
 * geometry of the template (WP-M27-04a).
 *
 * Every label carries the 112 notice of `PLAN.md` §2.
 */

function useActiveObjects() {
  return useQuery({
    queryKey: ['objects', 'stickers'],
    queryFn: () => apiFetch<ObjectListResponse>('/v1/objects?active=true'),
    retry: false,
  })
}

function useStickerTemplate() {
  return useQuery({
    queryKey: ['sticker-template'],
    queryFn: () => apiFetch<{ template: StickerTemplate }>('/v1/settings/sticker-template'),
    retry: false,
  })
}

function matchesSearch(object: ObjectSummary, search: string): boolean {
  if (search === '') {
    return true
  }

  const needle = search.toLowerCase()

  return [object.objectNo, object.name, object.city ?? ''].some((value) =>
    value.toLowerCase().includes(needle),
  )
}

export function StickerPage() {
  const { t } = useTranslation('object')
  const objects = useActiveObjects()
  const template = useStickerTemplate()
  const [search, setSearch] = useState('')
  const [deselected, setDeselected] = useState<string[]>([])
  const [sheetKey, setSheetKey] = useState<string | null>(null)

  const stored = template.data?.template ?? DEFAULT_STICKER_TEMPLATE
  const chosenKey = sheetKey ?? stored.templateKey
  const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === chosenKey)
  const sheetTemplate = useMemo<StickerTemplate>(
    () => (preset === undefined ? stored : { ...stored, templateKey: preset.key, geometry: preset.geometry }),
    [preset, stored],
  )

  const visible = useMemo(
    () =>
      (objects.data?.objects ?? [])
        .filter((object) => !object.pinned)
        .filter((object) => matchesSearch(object, search)),
    [objects.data, search],
  )
  const selected = visible.filter((object) => !deselected.includes(object.objectNo))

  function toggle(objectNo: string) {
    setDeselected((current) =>
      current.includes(objectNo)
        ? current.filter((entry) => entry !== objectNo)
        : [...current, objectNo],
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold print:hidden">{t('sticker.title')}</h1>
      <p className="text-sm text-slate-400 print:hidden">{t('sticker.hint')}</p>

      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          {t('sticker.search')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('sticker.sheet')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={chosenKey}
            onChange={(event) => setSheetKey(event.target.value)}
          >
            {STICKER_TEMPLATE_PRESETS.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {t(`common:stickerTemplate.preset.${candidate.key}`)}
              </option>
            ))}
            <option value="custom">{t('common:stickerTemplate.preset.custom')}</option>
          </select>
        </label>
        <button
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          type="button"
          disabled={selected.length === 0 || objects.isPending}
          onClick={() => window.print()}
        >
          {t('sticker.print')}
        </button>
      </div>

      <p className="text-sm text-slate-400 print:hidden">
        {t('sticker.lookHint')}{' '}
        <Link className="underline" to="/admin/sticker-template">
          {t('sticker.lookLink')}
        </Link>
      </p>

      {objects.isPending ? <p className="text-slate-400">{t('sticker.loading')}</p> : null}
      {objects.isError ? (
        <p className="text-rose-400" role="alert">
          {t('sticker.loadError')}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 print:hidden">
        <p className="text-sm text-slate-400">
          {t('sticker.selectedCount', { selected: selected.length, total: visible.length })}
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {visible.map((object) => (
            <li key={object.objectNo}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!deselected.includes(object.objectNo)}
                  onChange={() => toggle(object.objectNo)}
                />
                <span className="font-medium">{object.objectNo}</span>
                <span className="truncate text-slate-400">{object.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {selected.length === 0 ? (
        <p className="text-slate-400">{t('sticker.empty')}</p>
      ) : (
        <StickerSheet template={sheetTemplate} objects={selected} />
      )}
    </section>
  )
}
