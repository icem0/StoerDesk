import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  externalTypeCategory,
  type DeadlineHours,
  type InternalCreateTicketRequest,
  type InternalCreateTicketResponse,
  type ReporterUserListResponse,
  type StandardTextLocale,
  type TitleSwitchResponse,
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
 *
 * The title field exists only while the branding title switch is on
 * (WP-M9-25): the form reads `GET /v1/settings/title-switch` and renders no
 * title input while the switch is off, so the office never fills in a title
 * the installation does not keep.
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
 * Whether the installation captures a ticket title at all (WP-M9-25).
 *
 * The switch lives in the branding row and decides whether a ticket carries a
 * title. The form learns it from `GET /v1/settings/title-switch`, which is
 * guarded by `ticket.create` — the permission every user of this form holds.
 *
 * A missing, pending or failed answer means **off**: the title field stays
 * hidden, so the office never sees a field it may not fill in. The server
 * drops the title anyway while the switch is off (WP-M2-95).
 */
function useTitleSwitch() {
  const query = useQuery<TitleSwitchResponse>({
    queryKey: ['title-switch'],
    queryFn: () => apiFetch<TitleSwitchResponse>('/v1/settings/title-switch'),
    retry: false,
  })

  return query.data?.titleEnabled === true
}

/**
 * Effective deadline hours per priority (WP-M6-17, WP-M6-18).
 *
 * The create form labels every priority with the configured deadline, e.g.
 * `Normal (72h)`. The route is guarded by `ticket.create`, so the form's users
 * can read it without `settings.read`. Until the answer arrives the options keep
 * their plain priority name instead of showing a guessed default.
 */
function useDeadlineHours() {
  return useQuery<DeadlineHours>({
    queryKey: ['deadline-hours'],
    queryFn: () => apiFetch<DeadlineHours>('/v1/settings/deadline-hours'),
    retry: false,
  })
}

/** Active internal users for the reporter picker (WP-M2-98c). */
function useReporterUsers(enabled: boolean) {
  return useQuery<ReporterUserListResponse>({
    queryKey: ['reporter-users'],
    queryFn: () => apiFetch<ReporterUserListResponse>('/v1/tickets/reporter-users'),
    enabled,
    retry: false,
  })
}

/** `datetime-local` value of a date in the browser's local time. */
function localDateTimeValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
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
  const [reporterKind, setReporterKind] = useState<'internal' | 'external'>('external')
  const [reportedByUserId, setReportedByUserId] = useState('')
  const [reporterChannel, setReporterChannel] = useState<'phone' | 'email' | 'messenger'>('phone')
  const [reportedAt, setReportedAt] = useState(() => localDateTimeValue(new Date()))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)
  const activeCatalog = catalog.filter((entry) => entry.archived === false)
  /** WP-M9-25: the title field exists only while the branding switch is on. */
  const titleEnabled = useTitleSwitch()
  /** WP-M6-18: every priority option carries its configured deadline. */
  const deadlineHours = useDeadlineHours().data
  /** WP-M2-98c: the internal reporter picker only loads for the internal kind. */
  const reporterUsers = useReporterUsers(reporterKind === 'internal').data?.users ?? []

  function priorityLabel(
    priority: 'low' | 'normal' | 'high' | 'critical',
    label: string,
  ): string {
    const hours = deadlineHours?.[priority]

    return hours === undefined
      ? label
      : t('internal.create.priorityOption', { priority: label, hours })
  }

  function toggleFaultKey(key: string) {
    setFaultKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    )
  }

  function pickObject(object: ObjectOption) {
    setPickedObject(object)
    setSelectedObjectId(object.id)
  }

  function changeReporterKind(kind: 'internal' | 'external') {
    setReporterKind(kind)

    if (kind === 'external') {
      setReportedByUserId('')
    }
  }

  function pickReporterUser(userId: string) {
    setReportedByUserId(userId)
    const picked = reporterUsers.find((user) => user.id === userId)

    if (picked !== undefined) {
      setContactName(picked.name)
      setContactEmail(picked.email)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const payload: InternalCreateTicketRequest = {
        objectId: selectedObjectId,
        // WP-M9-25: the title travels only while the branding switch is on.
        title: titleEnabled && title.trim() !== '' ? title.trim() : undefined,
        description: description || undefined,
        faultTemplateKeys: faultKeys,
        priority,
        contact: {
          name: contactName || undefined,
          phone: contactPhone || undefined,
          email: contactEmail || undefined,
        },
        reporterChannel,
        reporterKind,
        reportedByUserId: reporterKind === 'internal' ? reportedByUserId : undefined,
        reportedAt: new Date(reportedAt).toISOString(),
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

        {titleEnabled ? (
          <div className="flex flex-col gap-2 col-span-full">
            <label
              className="text-sm font-medium text-slate-200"
              htmlFor="internal-create-title"
            >
              {t('internal.create.fields.title')}
            </label>
            <input
              className="rounded bg-slate-900 p-2 text-slate-100"
              id="internal-create-title"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        ) : null}

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
            <option value="low">
              {priorityLabel('low', t('internal.create.priority.low'))}
            </option>
            <option value="normal">
              {priorityLabel('normal', t('internal.create.priority.normal'))}
            </option>
            <option value="high">
              {priorityLabel('high', t('internal.create.priority.high'))}
            </option>
            <option value="critical">
              {priorityLabel('critical', t('internal.create.priority.critical'))}
            </option>
          </select>
        </div>

        <fieldset className="col-span-full rounded border border-slate-700 p-3">
          <legend className="px-1 text-sm font-medium text-slate-200">
            {t('internal.create.fields.reporter')}
          </legend>
          <p className="mb-3 text-xs text-slate-500">{t('internal.create.fields.contactHint')}</p>

          <div className="mb-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="reporter-kind"
                checked={reporterKind === 'external'}
                onChange={() => changeReporterKind('external')}
              />
              {t('internal.create.fields.reporterKindExternal')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="reporter-kind"
                checked={reporterKind === 'internal'}
                onChange={() => changeReporterKind('internal')}
              />
              {t('internal.create.fields.reporterKindInternal')}
            </label>
          </div>

          {reporterKind === 'internal' ? (
            <div className="mb-3 flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="internal-reporter-user">
                {t('internal.create.fields.reporterUser')}
              </label>
              <select
                className="rounded bg-slate-900 p-2 text-slate-100"
                id="internal-reporter-user"
                value={reportedByUserId}
                onChange={(event) => pickReporterUser(event.target.value)}
              >
                <option value="">{t('internal.create.fields.reporterUserPlaceholder')}</option>
                {reporterUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="internal-contact-name">
                {t('internal.create.fields.contactName')}
              </label>
              <input
                className="rounded bg-slate-900 p-2 text-slate-100 read-only:opacity-70"
                id="internal-contact-name"
                maxLength={120}
                readOnly={reporterKind === 'internal'}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="internal-contact-phone">
                {t('internal.create.fields.contactPhone')}
              </label>
              <input
                className="rounded bg-slate-900 p-2 text-slate-100"
                id="internal-contact-phone"
                maxLength={60}
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="internal-contact-email">
                {t('internal.create.fields.contactEmail')}
              </label>
              <input
                className="rounded bg-slate-900 p-2 text-slate-100 read-only:opacity-70"
                id="internal-contact-email"
                maxLength={320}
                readOnly={reporterKind === 'internal'}
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="col-span-full rounded border border-slate-700 p-3">
          <legend className="px-1 text-sm font-medium text-slate-200">
            {t('internal.create.fields.reportedAt')}
          </legend>
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <label className="text-sm font-medium text-slate-200" htmlFor="internal-reported-at">
              {t('internal.create.fields.reportedAtLabel')}
            </label>
            <input
              className="rounded bg-slate-900 p-2 text-slate-100"
              id="internal-reported-at"
              type="datetime-local"
              value={reportedAt}
              onChange={(event) => setReportedAt(event.target.value)}
            />
            <p className="text-xs text-slate-500">{t('internal.create.fields.reportedAtHint')}</p>
          </div>
        </fieldset>

        <fieldset className="col-span-full rounded border border-slate-700 p-3">
          <legend className="px-1 text-sm font-medium text-slate-200">
            {t('internal.create.fields.channel')}
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="reporter-channel"
                checked={reporterChannel === 'phone'}
                onChange={() => setReporterChannel('phone')}
              />
              {t('internal.create.fields.channelPhone')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="reporter-channel"
                checked={reporterChannel === 'email'}
                onChange={() => setReporterChannel('email')}
              />
              {t('internal.create.fields.channelEmail')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="reporter-channel"
                checked={reporterChannel === 'messenger'}
                onChange={() => setReporterChannel('messenger')}
              />
              {t('internal.create.fields.channelMessenger')}
            </label>
          </div>
        </fieldset>

        <div className="col-span-full flex gap-3">
          <button
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={
              submitting ||
              selectedObjectId === '' ||
              reportedAt === '' ||
              (reporterKind === 'internal' && reportedByUserId === '')
            }
          >
            {submitting ? t('internal.create.submitting') : t('internal.create.submit')}
          </button>
        </div>
      </form>
    </section>
  )
}
