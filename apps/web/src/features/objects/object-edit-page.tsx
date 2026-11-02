import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ObjectSummary } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Object edit page (`specs/08-objects-api.md` §9.1, WP-M2-13).
 *
 * Controlled edit form for an existing object: loads `GET /api/v1/objects/:objectNo`,
   prefilled fields for object number, name, address, contact, external id, notes
   and systems, submits `PATCH /api/v1/objects/:objectNo` and redirects to the
   object list on success.
 */

type SystemEntry = {
  id?: string
  type: string
  label: string
}

function emptySystem(): SystemEntry {
  return { type: '', label: '' }
}

export function ObjectEditPage() {
  const { t } = useTranslation('object')
  const navigate = useNavigate()
  const { objectNo } = useParams()

  const objectQuery = useQuery({
    queryKey: ['objects', 'edit', objectNo],
    queryFn: () => apiFetch<ObjectSummary>(`/v1/objects/${objectNo ?? ''}`),
    enabled: objectNo !== undefined,
    retry: false,
  })

  const [name, setName] = useState(objectQuery.data?.name ?? '')
  const [street, setStreet] = useState(objectQuery.data?.street ?? '')
  const [houseNumber, setHouseNumber] = useState(objectQuery.data?.houseNumber ?? '')
  const [postalCode, setPostalCode] = useState(objectQuery.data?.postalCode ?? '')
  const [city, setCity] = useState(objectQuery.data?.city ?? '')
  const [contactName, setContactName] = useState(objectQuery.data?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(objectQuery.data?.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(objectQuery.data?.contactEmail ?? '')
  const [externalId, setExternalId] = useState(objectQuery.data?.externalId ?? '')
  const [notes, setNotes] = useState(objectQuery.data?.notes ?? '')
  const [systems, setSystems] = useState<SystemEntry[]>(
    objectQuery.data?.systems.map((s) => ({ id: s.id, type: s.type, label: s.label })) ?? [emptySystem()],
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSystem() {
    setSystems((current) => [...current, emptySystem()])
  }

  function removeSystem(index: number) {
    setSystems((current) => current.filter((_entry, i) => i !== index))
  }

  function setSystemType(index: number, value: string) {
    setSystems((current) => {
      const next = [...current]
      const entry = next[index]
      if (entry) {
        next[index] = { ...entry, type: value }
      }
      return next
    })
  }

  function setSystemLabel(index: number, value: string) {
    setSystems((current) => {
      const next = [...current]
      const entry = next[index]
      if (entry) {
        next[index] = { ...entry, label: value }
      }
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const payload: Record<string, unknown> = {}

      if (name !== objectQuery.data?.name) payload.name = name
      if (street !== objectQuery.data?.street) payload.street = street || null
      if (houseNumber !== objectQuery.data?.houseNumber) payload.houseNumber = houseNumber || null
      if (postalCode !== objectQuery.data?.postalCode) payload.postalCode = postalCode || null
      if (city !== objectQuery.data?.city) payload.city = city || null
      if (contactName !== objectQuery.data?.contactName) payload.contactName = contactName || null
      if (contactPhone !== objectQuery.data?.contactPhone) payload.contactPhone = contactPhone || null
      if (contactEmail !== objectQuery.data?.contactEmail) payload.contactEmail = contactEmail || null
      if (externalId !== objectQuery.data?.externalId) payload.externalId = externalId || null
      if (notes !== objectQuery.data?.notes) payload.notes = notes || null

      const systemsPayload = systems
        .filter((entry) => entry.label !== '')
        .map(({ id, type, label }) => ({ id, type, label }))
      payload.systems = systemsPayload

      await apiFetch<unknown>(`/v1/objects/${objectNo ?? ''}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      navigate('/objects')
    } catch (known) {
      setSubmitting(false)

      if (known instanceof Error && (known as { status?: number; code?: string }).status === 422) {
        const code = (known as { code?: string }).code
        setError(
          code === 'object_no_taken'
            ? t('edit.errors.objectNoTaken')
            : t('edit.errors.invalidRequest'),
        )
        return
      }

      setError(t('edit.errors.unknown'))
    } finally {
      if (!error) setSubmitting(false)
    }
  }

  if (objectQuery.isPending) {
    return <p className="text-slate-400">{t('edit.loading')}</p>
  }

  if (objectQuery.isError) {
    return <p className="text-rose-400 text-sm" role="alert">{t('edit.errors.objectNotFound')}</p>
  }

  const object = objectQuery.data

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-between sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('edit.title', { objectNo: object.objectNo })}</h1>
          <p className="text-sm text-slate-400">{t('edit.hint')}</p>
        </div>
        <button
          className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
          type="button"
          onClick={() => navigate('/objects')}
        >
          {t('edit.cancel')}
        </button>
      </div>

      {error !== null ? (
        <p className="text-rose-400 text-sm" role="alert">{error}</p>
      ) : null}

      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('edit.fields.objectNo')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100 font-mono"
            maxLength={32}
            value={object.objectNo}
            readOnly
          />
          <p className="text-xs text-slate-500">{t('edit.hints.objectNo')}</p>
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('edit.fields.name')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.street')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={200}
            value={street}
            onChange={(event) => setStreet(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.houseNumber')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={40}
            value={houseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.postalCode')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={20}
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.city')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.contactName')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={160}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.contactPhone')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={60}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.contactEmail')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={320}
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.externalId')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={externalId}
            onChange={(event) => setExternalId(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.notes')}</label>
          <textarea
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </div>

        <div className="col-span-full">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">
            {t('edit.systems.title')}
          </h2>
          <div className="space-y-2">
            {systems.map((entry, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    {t('edit.systems.type')}
                  </label>
                  <select
                    className="rounded bg-slate-900 p-2 text-slate-100 text-sm"
                    value={entry.type}
                    onChange={(event) => setSystemType(index, event.target.value)}
                  >
                    <option value="BMA">BMA</option>
                    <option value="LICHTRUF">LICHTRUF</option>
                    <option value="RWA">RWA</option>
                    <option value="EMA">EMA</option>
                    <option value="SPRACHALARM">SPRACHALARM</option>
                    <option value="SONSTIGE">SONSTIGE</option>
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    {t('edit.systems.label')}
                  </label>
                  <input
                    className="rounded bg-slate-900 p-2 text-slate-100 text-sm"
                    maxLength={120}
                    value={entry.label}
                    onChange={(event) => setSystemLabel(index, event.target.value)}
                    placeholder={t('edit.systems.placeholder')}
                  />
                </div>
                <button
                  type="button"
                  className="rounded bg-rose-600 px-2 py-2 text-sm text-white"
                  onClick={() => removeSystem(index)}
                  disabled={systems.length === 1}
                >
                  −
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-2 text-sm text-slate-200 hover:bg-slate-600"
              onClick={addSystem}
            >
              + {t('edit.systems.add')}
            </button>
          </div>
        </div>

        <div className="col-span-full flex gap-3">
          <button
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={submitting || name === ''}
          >
            {submitting ? t('edit.submitting') : t('edit.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
