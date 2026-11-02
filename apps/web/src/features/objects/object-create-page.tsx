import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  OBJECT_SYSTEM_TYPES,
  type CreateObjectRequest,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Object create page (`specs/08-objects-api.md` §9.1, WP-M2-12).
 *
 * Controlled form for creating a new object: object number (required, validated
 * against `^[A-Z0-9][A-Z0-9_-]{0,31}$`), name (required), optional address and
   contact fields, and a dynamic systems array (type + label). Submits
   `POST /api/v1/objects` and redirects to the object list on success.
 */

type SystemEntry = {
  id?: string
  type: (typeof OBJECT_SYSTEM_TYPES)[number]
  label: string
}

function emptySystem(): SystemEntry {
  return { type: OBJECT_SYSTEM_TYPES[0], label: '' }
}

export function ObjectCreatePage() {
  const { t } = useTranslation('object')
  const navigate = useNavigate()

  const [objectNo, setObjectNo] = useState('')
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
  const [systems, setSystems] = useState<SystemEntry[]>([emptySystem()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSystem() {
    setSystems((current) => [...current, emptySystem()])
  }

  function removeSystem(index: number) {
    setSystems((current) => current.filter((_entry, i) => i !== index))
  }

  function setSystemType(index: number, value: (typeof OBJECT_SYSTEM_TYPES)[number]) {
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
      const payload: CreateObjectRequest = {
        objectNo,
        name,
        street: street || null,
        houseNumber: houseNumber || null,
        postalCode: postalCode || null,
        city: city || null,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        externalId: externalId || null,
        notes: notes || null,
        systems: systems.filter((entry) => entry.label !== ''),
      }

      await apiFetch<CreateObjectRequest>('/v1/objects', {
        method: 'POST',
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
            ? t('create.errors.objectNoTaken')
            : t('create.errors.invalidRequest'),
        )
        return
      }

      setError(t('create.errors.unknown'))
    } finally {
      if (!error) setSubmitting(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-between sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('create.title')}</h1>
          <p className="text-sm text-slate-400">{t('create.hint')}</p>
        </div>
        <button
          className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
          type="button"
          onClick={() => navigate('/objects')}
        >
          {t('create.cancel')}
        </button>
      </div>

      {error !== null ? (
        <p className="text-rose-400 text-sm" role="alert">{error}</p>
      ) : null}

      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('create.fields.objectNo')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={32}
            value={objectNo}
            onChange={(event) => setObjectNo(event.target.value.toUpperCase())}
            placeholder="12345_01"
          />
          <p className="text-xs text-slate-500">
            {t('create.hints.objectNo')}
          </p>
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('create.fields.name')}
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
          <label className="text-sm font-medium text-slate-200">{t('create.fields.street')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={200}
            value={street}
            onChange={(event) => setStreet(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.houseNumber')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={40}
            value={houseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.postalCode')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={20}
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.city')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.contactName')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={160}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.contactPhone')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={60}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.contactEmail')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={320}
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.externalId')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={externalId}
            onChange={(event) => setExternalId(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">{t('create.fields.notes')}</label>
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
            {t('create.systems.title')}
          </h2>
          <div className="space-y-2">
            {systems.map((entry, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    {t('create.systems.type')}
                  </label>
                  <select
                    className="rounded bg-slate-900 p-2 text-slate-100 text-sm"
                    value={entry.type}
                    onChange={(event) =>
                      setSystemType(index, event.target.value as (typeof OBJECT_SYSTEM_TYPES)[number])
                    }
                  >
                    {OBJECT_SYSTEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    {t('create.systems.label')}
                  </label>
                  <input
                    className="rounded bg-slate-900 p-2 text-slate-100 text-sm"
                    maxLength={120}
                    value={entry.label}
                    onChange={(event) => setSystemLabel(index, event.target.value)}
                    placeholder={t('create.systems.placeholder')}
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
              + {t('create.systems.add')}
            </button>
          </div>
        </div>

        <div className="col-span-full flex gap-3">
          <button
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={submitting || name === '' || objectNo === ''}
          >
            {submitting ? t('create.submitting') : t('create.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
