import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  STANDARD_TEXT_KEYS,
  type InternalCreateTicketRequest,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Internal ticket creation page (`PLAN.md` §7 rule 1, WP-M2-16).
 *
 * Staff form: choose an object (and optional system), enter title / description,
 * pick fault template keys and priority, add contact fields, then POST to
 * `/api/v1/tickets`. The server enforces `ticket.create` permission.
 */

type ObjectOption = {
  objectNo: string
  name: string
  systems: { id: string; type: string; label: string }[]
}

function useObjects() {
  return useQuery<{ objects: ObjectOption[] }>({
    queryKey: ['objects', 'internal-picker'],
    queryFn: () => apiFetch<{ objects: ObjectOption[] }>('/v1/objects?active=true'),
    retry: false,
  })
}

export function InternalCreatePage() {
  const { t } = useTranslation('ticket')
  const navigate = useNavigate()

  const objectsQuery = useObjects()
  const [objectId, setObjectId] = useState('')
  const [systemId, setSystemId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [faultKeys, setFaultKeys] = useState<string[]>([])
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const objects = objectsQuery.data?.objects ?? []
  const selectedObject = objects.find((o) => o.objectNo === objectId)
  const systems = selectedObject?.systems ?? []

  function toggleFaultKey(key: string) {
    setFaultKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const payload: InternalCreateTicketRequest = {
        objectId,
        systemId: systemId || undefined,
        title: title || undefined,
        description: description || undefined,
        faultTemplateKeys: faultKeys,
        priority,
        contact: {
          name: contactName || undefined,
          phone: contactPhone || undefined,
          email: contactEmail || undefined,
        },
      }

      await apiFetch<InternalCreateTicketRequest>('/v1/tickets', {
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
          code === 'system_not_found'
            ? t('internal.create.errors.systemNotFound')
            : t('internal.create.errors.invalidRequest'),
        )
        return
      }

      setError(t('internal.create.errors.unknown'))
    } finally {
      if (!error) setSubmitting(false)
    }
  }

  if (objectsQuery.isPending) {
    return <p className="text-slate-400">{t('internal.loading')}</p>
  }

  if (objectsQuery.isError || objects.length === 0) {
    return <p className="text-rose-400 text-sm" role="alert">{t('internal.errors.noObjects')}</p>
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-between sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('internal.create.title')}</h1>
          <p className="text-sm text-slate-400">{t('internal.create.hint')}</p>
        </div>
        <button
          className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
          type="button"
          onClick={() => navigate('/objects')}
        >
          {t('internal.create.cancel')}
        </button>
      </div>

      {error !== null ? (
        <p className="text-rose-400 text-sm" role="alert">{error}</p>
      ) : null}

      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.object')}
          </label>
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={objectId}
            onChange={(event) => setObjectId(event.target.value)}
            required
          >
            <option value="">{t('internal.create.fields.objectPlaceholder')}</option>
            {objects.map((o) => (
              <option key={o.objectNo} value={o.objectNo}>
                {o.objectNo} — {o.name}
              </option>
            ))}
          </select>
        </div>

        {selectedObject !== undefined && (
          <div className="flex flex-col gap-2 col-span-full">
            <label className="text-sm font-medium text-slate-200">
              {t('internal.create.fields.system')}
            </label>
            <select
              className="rounded bg-slate-900 p-2 text-slate-100"
              value={systemId}
              onChange={(event) => setSystemId(event.target.value)}
            >
              <option value="">{t('internal.create.fields.systemPlaceholder')}</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.type} — {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.title')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.description')}
          </label>
          <textarea
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.faults')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {STANDARD_TEXT_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 p-2 rounded bg-slate-800">
                <input
                  type="checkbox"
                  checked={faultKeys.includes(key)}
                  onChange={() => toggleFaultKey(key)}
                />
                <span className="text-sm text-slate-200">{key}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.priority')}
          </label>
          <select
            className="rounded bg-slate-900 p-2 text-slate-100"
            value={priority}
            onChange={(event) => setPriority(event.target.value as 'low' | 'normal' | 'high' | 'critical')}
          >
            <option value="low">{t('internal.create.priority.low')}</option>
            <option value="normal">{t('internal.create.priority.normal')}</option>
            <option value="high">{t('internal.create.priority.high')}</option>
            <option value="critical">{t('internal.create.priority.critical')}</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.contact')}
          </label>
          <p className="text-xs text-slate-500">{t('internal.create.fields.contactHint')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('internal.create.fields.contactName')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('internal.create.fields.contactPhone')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={60}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">{t('internal.create.fields.contactEmail')}</label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={320}
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </div>

        <div className="col-span-full flex gap-3">
          <button
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={submitting || objectId === ''}
          >
            {submitting ? t('internal.create.submitting') : t('internal.create.submit')}
          </button>
        </div>
      </form>
    </section>
  )
}
