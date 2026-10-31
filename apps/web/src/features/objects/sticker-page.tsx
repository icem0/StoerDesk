import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import type { ObjectListResponse, ObjectSummary } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Printable QR sticker sheets (`specs/08-objects-api.md` §9.3, WP-M2-03).
 *
 * The browser print dialog is the primary path (`PLAN.md` §4/§11): the page renders
 * A6 cards, one per selected object, and writes a single `@page` rule for the chosen
 * sheet format. Every card carries the 112 notice of `PLAN.md` §2.
 */

type StickerFormat = 'a6' | 'a4'

const PAGE_RULES: Record<StickerFormat, string> = {
  a6: '@page { size: 105mm 148mm; margin: 0; }',
  a4: '@page { size: A4; margin: 0; }',
}

const QR_MARGIN_MODULES = 2
const QR_SIZE_PX = 256

function useActiveObjects() {
  return useQuery({
    queryKey: ['objects', 'stickers'],
    queryFn: () => apiFetch<ObjectListResponse>('/v1/objects?active=true'),
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

function stickerTarget(token: string): string {
  // The QR carries only the public URL with the token, never the object number (§9.2).
  return `${window.location.origin}/m/${token}`
}

function StickerCard({ object }: { object: ObjectSummary }) {
  const { t } = useTranslation('object')

  return (
    <article className="sticker-card">
      {object.qrToken !== null ? (
        <QRCodeSVG
          className="sticker-card__qr"
          value={stickerTarget(object.qrToken)}
          level="M"
          marginSize={QR_MARGIN_MODULES}
          size={QR_SIZE_PX}
          title={object.objectNo}
        />
      ) : (
        <p className="sticker-card__no-token">{t('sticker.noToken')}</p>
      )}
      <p className="sticker-card__name">{object.name}</p>
      <p className="sticker-card__object-no">{object.objectNo}</p>
      <p className="sticker-card__call">{t('sticker.reportCall')}</p>
      <p className="sticker-card__notice">{t('sticker.emergencyNotice')}</p>
    </article>
  )
}

export function StickerPage() {
  const { t } = useTranslation('object')
  const objects = useActiveObjects()
  const [search, setSearch] = useState('')
  const [deselected, setDeselected] = useState<string[]>([])
  const [format, setFormat] = useState<StickerFormat>('a4')

  const visible = useMemo(
    () => (objects.data?.objects ?? []).filter((object) => matchesSearch(object, search)),
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
          {t('sticker.format')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={format}
            onChange={(event) => setFormat(event.target.value as StickerFormat)}
          >
            <option value="a6">{t('sticker.formatA6')}</option>
            <option value="a4">{t('sticker.formatA4')}</option>
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
        <>
          <style>{PAGE_RULES[format]}</style>
          <div className={`sticker-sheet sticker-sheet--${format}`}>
            {selected.map((object) => (
              <StickerCard key={object.objectNo} object={object} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
