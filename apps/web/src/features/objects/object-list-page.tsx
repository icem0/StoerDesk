import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  externalTypeCategory,
  type ObjectListResponse,
  type ObjectSummary,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Object list page (`specs/08-objects-api.md` §9.1, WP-M2-11 … WP-M2-14).
 *
 * View of the object list: search over object number, name and city, server-side
 * filters for `active`, `city` and `systemType`, one row per object with its
 * systems and an active/inactive badge. An object that BMAcloud owns (`external_id`
 * set, `specs/17-bmacloud-sync.md` §17.4) carries a second, independent badge next to
 * its number (WP-M2-39) and shows the system type the sync stored in
 * `external_type` (§17.3, WP-M2-66). Each row links to the edit page
   (WP-M2-13) and has a delete button (WP-M2-14). Create lives on `/objects/create`
   (WP-M2-12).
 */

function useObjects(query: {
  search?: string
  active?: string
  city?: string
  systemType?: string
}) {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.active !== undefined && query.active !== 'all') params.set('active', query.active)
  if (query.city) params.set('city', query.city)
  if (query.systemType) params.set('systemType', query.systemType)

  return useQuery({
    queryKey: ['objects', 'list', query],
    queryFn: () => apiFetch<ObjectListResponse>(`/v1/objects?${params.toString()}`),
    retry: false,
  })
}

function systemChips(systems: ObjectSummary['systems']) {
  return systems.map((system) => (
    <span
      key={system.id}
      className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
    >
      {system.type}
      <span className="text-slate-400">{` · ${system.label}`}</span>
    </span>
  ))
}

function ObjectRow({ object }: { object: ObjectSummary }) {
  const { t } = useTranslation('object')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function handleDelete() {
    if (!window.confirm(t('delete.confirm', { objectNo: object.objectNo }))) {
      return
    }

    try {
      await apiFetch<never>(`/v1/objects/${object.objectNo}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['objects', 'list'] })
    } catch (known) {
      if (known instanceof Error && (known as { status?: number; code?: string }).status === 404) {
        alert(t('delete.errors.objectNotFound'))
        return
      }
      alert(t('delete.errors.unknown'))
    }
  }

  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800/50 transition-colors">
      <td className="p-3 text-sm font-mono text-slate-300">
        {object.objectNo}
        {object.externalId !== null ? (
          <span
            className="ml-2 inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300"
            title={t('list.externalHint')}
          >
            {t('list.externalBadge')}
          </span>
        ) : null}
      </td>
      <td className="p-3 text-sm text-slate-200">{object.name}</td>
      <td className="p-3 text-sm">
        {object.externalType === null ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span
            className="inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
            title={object.externalType}
          >
            {externalTypeCategory(object.externalType) ?? object.externalType}
          </span>
        )}
      </td>
      <td className="p-3 text-sm text-slate-400">
        {[object.street, object.houseNumber, object.postalCode, object.city]
          .filter(Boolean)
          .join(', ') || '-'}
      </td>
      <td className="p-3 text-sm">{systemChips(object.systems)}</td>
      <td className="p-3 text-sm">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            object.active ? 'bg-emerald-900/30 text-emerald-300' : 'bg-rose-900/30 text-rose-300'
          }`}
        >
          {object.active ? t('list.active') : t('list.inactive')}
        </span>
      </td>
      <td className="p-3 text-sm text-right text-slate-500">
        <button
          className="rounded bg-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-500"
          type="button"
          onClick={() => navigate(`/objects/${object.objectNo}/edit`)}
        >
          {t('list.actions.edit')}
        </button>{' '}
        <button
          className="rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
          type="button"
          onClick={handleDelete}
        >
          {t('list.actions.delete')}
        </button>
      </td>
    </tr>
  )
}

export function ObjectListPage() {
  const { t } = useTranslation('object')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<'true' | 'false' | 'all'>('true')
  const [city, setCity] = useState('')
  const [systemType, setSystemType] = useState('')

  const objects = useObjects({ search, active, city, systemType })

  const filtered = useMemo(() => {
    const allRows = objects.data?.objects ?? []
    if (search === '') return allRows
    const needle = search.toLowerCase()
    return allRows.filter(
      (row) =>
        row.objectNo.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        (row.city ?? '').toLowerCase().includes(needle),
    )
  }, [objects.data, search])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-between sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('list.title')}</h1>
          <p className="text-sm text-slate-400">{t('list.hint')}</p>
        </div>
        <button
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          type="button"
          onClick={() => navigate('/objects/create')}
        >
          {t('list.actions.create')}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          {t('list.search')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('list.active')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={active}
            onChange={(event) => setActive(event.target.value as typeof active)}
          >
            <option value="true">{t('list.activeTrue')}</option>
            <option value="false">{t('list.activeFalse')}</option>
            <option value="all">{t('list.activeAll')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('list.city')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="text"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('list.systemType')}
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={systemType}
            onChange={(event) => setSystemType(event.target.value)}
          >
            <option value="">{t('list.systemTypeAll')}</option>
            <option value="BMA">BMA</option>
            <option value="LICHTRUF">LICHTRUF</option>
            <option value="RWA">RWA</option>
            <option value="EMA">EMA</option>
            <option value="SPRACHALARM">SPRACHALARM</option>
            <option value="SONSTIGE">SONSTIGE</option>
          </select>
        </label>
      </div>

      {objects.isPending ? (
        <p className="text-slate-400">{t('list.loading')}</p>
      ) : objects.isError ? (
        <p className="text-rose-400" role="alert">
          {t('list.loadError')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400">{t('list.noObjects')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.objectNo')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.name')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.type')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.city')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.systems')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('list.columns.active')}
                </th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                  {t('list.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((object) => (
                <ObjectRow key={object.objectNo} object={object} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
