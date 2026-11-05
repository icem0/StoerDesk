import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  type InternalCreateTicketRequest,
  type StandardTextLocale,
} from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'
import { useFaultCatalog } from './use-fault-catalog'

/**
 * Internal ticket creation page (`PLAN.md` §7 rule 1, WP-M2-16).
 *
 * Staff form: choose an object (full-text search over object number, name and
 * address, debounced against `GET /v1/objects?search=`), pick an optional system,
 * enter title / description, pick fault template keys and priority, add contact
 * fields, then POST to `/api/v1/tickets`. The server enforces `ticket.create`.
 * The object is identified by its UUID `id`, not by `objectNo`, so the server
 * lookup in `createInternalTicket` resolves.
 */

type ObjectOption = {
  id: string
  objectNo: string
  name: string
}

function useObjects(search: string) {
  return useQuery<{ objects: ObjectOption[] }>({
    queryKey: ['objects', 'internal-picker', search],
    queryFn: () => {
      const params = new URLSearchParams({ active: 'true' })

      if (search.trim() !== '') {
        params.set('search', search.trim())
      }

      return apiFetch<{ objects: ObjectOption[] }>(`/v1/objects?${params.toString()}`)
    },
    retry: false,
  })
}

export function InternalCreatePage() {
  const { t, i18n } = useTranslation('ticket')
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedObjectId, setSelectedObjectId] = useState('')
  const [pickedObject, setPickedObject] = useState<ObjectOption | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [faultKeys, setFaultKeys] = useState<string[]>([])
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce the search so the object list API is not hit on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150)

    return () => clearTimeout(timer)
  }, [search])

  const objectsQuery = useObjects(debouncedSearch)

  const objects = objectsQuery.data?.objects ?? []
  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)
  const activeCatalog = catalog.filter((entry) => entry.archived === false)

  function toggleFaultKey(key: string) {
    setFaultKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    )
  }

  function pickObject(object: ObjectOption) {
    setPickedObject(object)
    setSelectedObjectId(object.id)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const payload: InternalCreateTicketRequest = {
        objectId: selectedObjectId,
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

      if (known instanceof ApiError && known.code !== undefined) {
        setError(errorNotice(known.code))
        return
      }

      setError(t('internal.create.errors.unknown'))
    } finally {
      if (!error) setSubmitting(false)
    }
  }

  function errorNotice(code: string): string {
    switch (code) {
      case 'object_not_found':
        return t('internal.create.errors.objectNotFound')
      case 'session_invalid':
        return t('internal.create.errors.sessionInvalid')
      case 'ticket_create_failed':
        return t('internal.create.errors.ticketCreateFailed')
      case 'invalid_request':
        return t('internal.create.errors.invalidRequest')
      default:
        return t('internal.create.errors.unknown')
    }
  }

  if (objectsQuery.isPending) {
    return <p className="text-slate-400">{t('internal.loading')}</p>
  }

  if (objectsQuery.isError) {
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
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="search"
            placeholder={t('internal.create.fields.objectSearchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim() !== '' ? (
            <div className="flex flex-col gap-1 border border-slate-700 rounded bg-slate-900/80">
              {objects.length === 0 ? (
                <div className="p-2 text-xs text-slate-400">
                  {t('internal.create.errors.noMatch')}
                </div>
              ) : (
                objects.map((object) => (
                  <button
                    key={object.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                    type="button"
                    onClick={() => pickObject(object)}
                  >
                    <span className="font-mono text-slate-400">{object.objectNo}</span>
                    <span>{object.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
          {pickedObject !== undefined ? (
            <p className="text-xs text-slate-400">
              <span className="font-mono">{pickedObject.objectNo}</span>{' — '}
              {pickedObject.name}
            </p>
          ) : null}
        </div>

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
            {activeCatalog.map((entry) => (
              <label key={entry.key} className="flex items-center gap-2 p-2 rounded bg-slate-800">
                <input
                  type="checkbox"
                  checked={faultKeys.includes(entry.key)}
                  onChange={() => toggleFaultKey(entry.key)}
                />
                <span className="text-sm text-slate-200">{entry.text}</span>
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
            disabled={submitting || selectedObjectId === ''}
          >
            {submitting ? t('internal.create.submitting') : t('internal.create.submit')}
          </button>
        </div>
      </form>
    </section>
  )
}
