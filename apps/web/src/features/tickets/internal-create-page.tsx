import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  externalTypeCategory,
  type InternalCreateTicketRequest,
  type InternalCreateTicketResponse,
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
 *
 * The object picker is a bounded dropdown: closed by default, opens on focus,
 * lists matches in a scrollable box so a large object table never unfolds the
 * page, and the search is debounced so the API is not hit on every keystroke.
 */

type ObjectOption = {
  id: string
  objectNo: string
  name: string
  externalType: string | null
}

function objectType(object: ObjectOption): string | null {
  return externalTypeCategory(object.externalType) ?? object.externalType
}

function objectLabel(object: ObjectOption): string {
  const type = objectType(object)

  return `${object.objectNo} — ${object.name}${type === null ? '' : ` (${type})`}`
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

/**
 * Bounded object picker for the internal create form.
 *
 * The list stays closed until the search field is focused. When closed, the field
 * shows the picked object (number, name and type) as its value, so the choice
 * stays inside the field instead of adding a line below it. Matches render in an
 * absolutely positioned, fixed-height, scrollable overlay (`max-h-64`,
 * `overflow-y-auto`), so opening the list never pushes the form down. The query
 * key carries the debounced search, so the object list API is only called after
 * the user has paused typing — never on every keystroke.
 */
function ObjectPicker({
  selected,
  onPick,
}: {
  selected?: ObjectOption
  onPick: (object: ObjectOption) => void
}) {
  const { t } = useTranslation('ticket')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const objectsQuery = useObjects(debouncedSearch)
  const objects = objectsQuery.data?.objects ?? []
  const isLoading = objectsQuery.isPending
  const isError = objectsQuery.isError

  // Debounce the search so the object list API is not hit on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150)

    return () => clearTimeout(timer)
  }, [search])

  function handleFocus() {
    setOpen(true)
    setSearch('')
    setHighlighted(-1)
  }

  function handleBlur() {
    setOpen(false)
    setHighlighted(-1)
  }

  function handlePick(object: ObjectOption) {
    onPick(object)
    setOpen(false)
    setHighlighted(-1)
    setSearch('')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
      return
    }

    if (!open || objects.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((current) => (current + 1) % objects.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((current) => (current - 1 + objects.length) % objects.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()

      if (highlighted >= 0) {
        handlePick(objects[highlighted]!)
      }
    }
  }

  const noMatch = search.trim() !== '' && !isLoading && !isError && objects.length === 0
  const value = open ? search : selected !== undefined ? objectLabel(selected) : ''

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="search"
        placeholder={
          open
            ? t('internal.create.fields.objectSearchPlaceholder')
            : selected === undefined
              ? t('internal.create.fields.objectPlaceholder')
              : undefined
        }
        value={value}
        onChange={(event) => {
          setSearch(event.target.value)
          setOpen(true)
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-controls="object-picker-list"
        aria-autocomplete="list"
        className="w-full rounded bg-slate-900 p-2 text-slate-100"
      />
      {open ? (
        <div
          id="object-picker-list"
          role="listbox"
          aria-label={t('internal.create.fields.object')}
          className="absolute left-0 right-0 top-full z-20 mt-1 flex flex-col gap-1 border border-slate-700 rounded bg-slate-900 shadow-lg max-h-64 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-2 text-xs text-slate-400">{t('internal.loading')}</div>
          ) : isError ? (
            <div className="p-2 text-xs text-slate-400" role="alert">
              {t('internal.errors.noObjects')}
            </div>
          ) : noMatch ? (
            <div className="p-2 text-xs text-slate-400">{t('internal.create.errors.noMatch')}</div>
          ) : (
            objects.map((object, index) => {
              const type = objectType(object)

              return (
                <button
                  key={object.id}
                  id={`object-picker-option-${index}`}
                  role="option"
                  aria-selected={highlighted === index}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-slate-200 ${
                    highlighted === index ? 'bg-sky-600/20 text-white' : 'hover:bg-slate-800'
                  }`}
                  type="button"
                  onMouseDown={(event) => {
                    // Keep the input focused so the option click really selects it.
                    event.preventDefault()
                  }}
                  onClick={() => handlePick(object)}
                >
                  <span className="font-mono text-slate-400">{object.objectNo}</span>
                  <span className="flex-1">{object.name}</span>
                  {type !== null ? (
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                      {type}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export function InternalCreatePage() {
  const { t, i18n } = useTranslation('ticket')
  const navigate = useNavigate()

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

      const created = await apiFetch<InternalCreateTicketResponse>('/v1/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      navigate(`/tickets/${created.ticketNo}`)
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

  if (error !== null) {
    return (
      <p className="text-rose-400 text-sm" role="alert">
        {error}
      </p>
    )
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

      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.object')}
          </label>
          <ObjectPicker selected={pickedObject} onPick={pickObject} />
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
            onChange={(event) =>
              setPriority(event.target.value as 'low' | 'normal' | 'high' | 'critical')
            }
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
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.contactName')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={120}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.contactPhone')}
          </label>
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            maxLength={60}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200">
            {t('internal.create.fields.contactEmail')}
          </label>
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
