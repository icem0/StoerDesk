import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ObjectSummary, TicketPriority } from '@stoerdesk/shared'
import { apiFetch } from '../../lib/api'

/**
 * Object edit page (`specs/08-objects-api.md` §9.1, WP-M2-13).
 *
 * Controlled edit form for an existing object: loads `GET /api/v1/objects/:objectNo`,
   prefilled fields for object number, name, address, contact, external id, notes
   and the priority of the object, submits `PATCH /api/v1/objects/:objectNo` and
   redirects to the object list on success.
 *
 * The fields are filled when the answer of the query arrives: the state of the
 * form starts empty, because the query answers after the first render — without
 * that the office would see an empty form and would save empty fields over the
 * object (WP-M14-134f).
 */

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

  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [externalId, setExternalId] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<TicketPriority | 'standard'>('standard')
  const [filledObjectId, setFilledObjectId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (priority !== (objectQuery.data?.priorityOverride ?? 'standard')) {
        payload.priority = priority === 'standard' ? null : priority
      }

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

  // The answer of the query arrives after the first render: the fields of the
  // form are filled once per object, a later answer of the same object keeps
  // what the user typed.
  if (object.id !== filledObjectId) {
    setFilledObjectId(object.id)
    setName(object.name)
    setStreet(object.street ?? '')
    setHouseNumber(object.houseNumber ?? '')
    setPostalCode(object.postalCode ?? '')
    setCity(object.city ?? '')
    setContactName(object.contactName ?? '')
    setContactPhone(object.contactPhone ?? '')
    setContactEmail(object.contactEmail ?? '')
    setExternalId(object.externalId ?? '')
    setNotes(object.notes ?? '')
    setPriority(object.priorityOverride ?? 'standard')
  }

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

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('edit.fields.priority')}</label>
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TicketPriority | 'standard')}
          >
            <option value="standard">{t('priority.standard')}</option>
            <option value="low">{t('priority.low')}</option>
            <option value="normal">{t('priority.normal')}</option>
            <option value="high">{t('priority.high')}</option>
            <option value="critical">{t('priority.critical')}</option>
          </select>
        </div>

        <div className="col-span-full flex gap-3">
          <button
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
