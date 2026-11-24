import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  ObjectCityListResponse,
  ObjectListResponse,
  StickerTemplate,
} from '@stoerdesk/shared'
import { DEFAULT_STICKER_TEMPLATE, STICKER_TEMPLATE_PRESETS } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { StickerSheet } from './sticker-sheet'

/**
 * The printable QR stickers (`specs/08-objects-api.md` §9.3, ADR-0050).
 *
 * The page lists the objects of the list API as a checklist and prints them on
 * the sheet of the chosen format. The list is filtered **on the server** with
 * the query of the object list (`search`, `active`, `city`), the checklist can
 * be selected completely or not at all, and the **look** of the sticker is the
 * setting of the installation (`GET /api/v1/settings/sticker-template`): the
 * print job chooses the sheet, not the look.
 *
 * Every label carries the 112 notice of `PLAN.md` §2.
 */

/** The time the search waits before it asks the server. */
const SEARCH_DELAY_MS = 300

type ActiveFilter = 'true' | 'false' | 'all'

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DELAY_MS)

    return () => clearTimeout(timer)
  }, [value])

  return debounced
}

function useObjects(search: string, active: ActiveFilter, city: string) {
  return useQuery({
    queryKey: ['objects', 'stickers', { search, active, city }],
    queryFn: () => {
      const params = new URLSearchParams({ active })

      if (search !== '') {
        params.set('search', search)
      }

      if (city !== '') {
        params.set('city', city)
      }

      return apiFetch<ObjectListResponse>(`/v1/objects?${params.toString()}`)
    },
    retry: false,
  })
}

function useCities() {
  return useQuery({
    queryKey: ['objects', 'cities'],
    queryFn: () => apiFetch<ObjectCityListResponse>('/v1/objects/cities'),
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

export function StickerPage() {
  const { t } = useTranslation('object')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<ActiveFilter>('true')
  const [city, setCity] = useState('')
  const [deselected, setDeselected] = useState<string[]>([])
  const [sheetKey, setSheetKey] = useState<string | null>(null)

  const debouncedSearch = useDebounced(search)
  const objects = useObjects(debouncedSearch, active, city)
  const cities = useCities()
  const template = useStickerTemplate()

  const stored = template.data?.template ?? DEFAULT_STICKER_TEMPLATE
  const chosenKey = sheetKey ?? stored.templateKey
  const preset = STICKER_TEMPLATE_PRESETS.find((candidate) => candidate.key === chosenKey)
  const sheetTemplate = useMemo<StickerTemplate>(
    () =>
      preset === undefined
        ? stored
        : { ...stored, templateKey: preset.key, geometry: preset.geometry },
    [preset, stored],
  )

  // A new filter shows a new list — the selection of the old one does not
  // follow it.
  function changeFilter(change: () => void) {
    change()
    setDeselected([])
  }

  const visible = useMemo(
    () => (objects.data?.objects ?? []).filter((object) => !object.pinned),
    [objects.data],
  )
  const selected = visible.filter((object) => !deselected.includes(object.objectNo))

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
            onChange={(event) => changeFilter(() => setSearch(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('sticker.city')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={city}
            onChange={(event) => changeFilter(() => setCity(event.target.value))}
          >
            <option value="">{t('sticker.allCities')}</option>
            {(cities.data?.cities ?? []).map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('sticker.active')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={active}
            onChange={(event) =>
              changeFilter(() => setActive(event.target.value as ActiveFilter))
            }
          >
            <option value="true">{t('sticker.activeTrue')}</option>
            <option value="false">{t('sticker.activeFalse')}</option>
            <option value="all">{t('sticker.activeAll')}</option>
          </select>
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
        <div className="flex gap-2">
          <button
            className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 disabled:opacity-50"
            type="button"
            disabled={visible.length === 0}
            onClick={() => setDeselected([])}
          >
            {t('sticker.selectAll')}
          </button>
          <button
            className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 disabled:opacity-50"
            type="button"
            disabled={visible.length === 0}
            onClick={() => setDeselected(visible.map((object) => object.objectNo))}
          >
            {t('sticker.selectNone')}
          </button>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {visible.map((object) => (
            <li key={object.objectNo}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!deselected.includes(object.objectNo)}
                  onChange={() =>
                    setDeselected((current) =>
                      current.includes(object.objectNo)
                        ? current.filter((entry) => entry !== object.objectNo)
                        : [...current, object.objectNo],
                    )
                  }
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
