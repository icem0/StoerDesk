import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  altchaVerificationSchema,
  publicReportContactSchema,
  qrTokenSchema,
} from '@stoerdesk/shared'
import type {
  AltchaVerification,
  PublicOpenTicket,
  PublicOpenTickets,
  PublicQrObject,
  PublicReport,
  PublicReportContact,
  PublicReportRequest,
  PublicTicketComment,
  QrResolveResponse,
  StandardTextLocale,
} from '@stoerdesk/shared'
// The JSX types of the Altcha web component (`<altcha-widget>`).
import type {} from 'altcha/types/react'

import { ApiError, apiFetch } from '../../lib/api'
import {
  enqueueReport,
  outboxAvailable,
  queuedReports,
  replayOutbox,
} from '../../lib/outbox'
import { PhotoUpload } from './photo-upload'
import { usePublicFaultCatalog, type FaultCatalogEntry } from './use-fault-catalog'

/**
 * Public report form at `/m/:token` (`specs/06-report-form.md` §7.1–§7.3, WP-M2-05).
 *
 * A reporter arrives from a QR code with no session, so this page is **not** a child of
 * the `Shell` — it must never show the login form. The token is resolved through
 * `GET /api/v1/public/qr/:token` first, so the submit body always carries the current
 * token of a retired one (§7.3), and one `client_uuid` per opened form makes a retry
 * idempotent (§7.3.3). Photos are compressed client-side by WP-M2-05b, the status page
 * `/s/:token` is WP-M2-06.
 *
 * The spam protection of §7.6 is WP-M2-07d: the body always carries the hidden
 * honeypot `website`, and the Altcha widget only appears after the server answered
 * `400 captcha_required` — a normal report never sees a captcha. WP-M9-37 threads
 * the same fields through the public comment path and shows the API's `403
 * comment_status_token_mismatch` notice.
 */

const TEXT_MAX_LENGTH = 4000
const jsonHeaders = { 'content-type': 'application/json' }

/** The `422`/`404`/`400` codes of §7.3.2 the form can answer with its own notice. */
const handledErrorCodes = [
  'qr_token_not_found',
  'report_text_required',
  'contact_required',
  'system_not_found',
  'invalid_request',
  'rate_limited',
  'photo_limit_exceeded',
  'photo_too_large',
  'photo_type_unsupported',
  'captcha_required',
  // The duplicate hint of §7.8 — the open tickets and the comment on them.
  'ticket_not_found',
  'ticket_closed',
  'ticket_object_mismatch',
  'comment_text_required',
  'comment_status_token_mismatch',
  'duplicate_parent_invalid',
] as const

/**
 * The challenge of the API (`apps/api/src/tickets/altcha.ts`, WP-M2-07b) in the
 * `altcha-lib` v1 format: the widget of the form solves it and answers with the
 * solved payload.
 */
type AltchaChallenge = {
  algorithm: string
  challenge: string
  salt: string
  signature: string
  maxnumber?: number
}

/**
 * Decodes the solved proof of work of the widget into the flat payload of
 * `altchaVerificationSchema` (§7.6). The widget answers base64; only the fields the
 * server recomputes are sent — the `took` of the widget is a fraction and would not
 * pass the schema.
 */
function verificationOf(payload: string): AltchaVerification | undefined {
  let decoded: unknown

  try {
    decoded = JSON.parse(atob(payload))
  } catch {
    return undefined
  }

  if (typeof decoded !== 'object' || decoded === null) {
    return undefined
  }

  const candidate = decoded as Record<string, unknown>
  const parsed = altchaVerificationSchema.safeParse({
    algorithm: candidate.algorithm,
    challenge: candidate.challenge,
    salt: candidate.salt,
    signature: candidate.signature,
    number: candidate.number,
  })

  return parsed.success ? parsed.data : undefined
}

/**
 * Fetches a proof-of-work challenge — **only** after the server answered
 * `400 captcha_required` (§7.6). A normal report never loads the widget.
 */
function useAltchaChallenge() {
  const [challenge, setChallenge] = useState<AltchaChallenge | null>(null)

  const request = useCallback(async () => {
    const answer = await apiFetch<AltchaChallenge>('/v1/public/altcha/challenge', {
      method: 'POST',
    })

    setChallenge(answer)

    return answer
  }, [])

  return { challenge, request }
}

function usePublicQr(token: string) {
  return useQuery({
    queryKey: ['public-qr', token],
    queryFn: () => apiFetch<QrResolveResponse>(`/v1/public/qr/${token}`),
    enabled: qrTokenSchema.safeParse(token).success,
    retry: false,
  })
}

/**
 * The open tickets of the object (`specs/06-report-form.md` §7.8.1, WP-M2-08).
 *
 * The query key carries the chosen system, so the hint follows the selection of
 * the reporter. The answer of the API never carries a description, a contact
 * or a `status_token` — only the number, the status and the time.
 */
function useOpenTickets(qrToken: string | undefined) {
  return useQuery({
    queryKey: ['public-open-tickets', qrToken],
    queryFn: () => {
      const params = new URLSearchParams({ qrToken: qrToken ?? '' })

      return apiFetch<PublicOpenTickets>(`/v1/public/tickets/open?${params.toString()}`)
    },
    enabled: qrToken !== undefined,
    retry: false,
  })
}

function localeOf(language: string): StandardTextLocale {
  return language === 'en' ? 'en' : 'de'
}

function addressLine(object: PublicQrObject): string {
  const street = [object.street ?? '', object.houseNumber ?? ''].join(' ').trim()
  const place = [object.postalCode ?? '', object.city ?? ''].join(' ').trim()

  return [street, place].filter((part) => part !== '').join(', ')
}

function errorMessage(error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return `report.errors.${code}`
}

function ObjectHeader({ object }: { object: PublicQrObject }) {
  const address = addressLine(object)

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{object.objectNo}</p>
      <h1 className="text-xl font-semibold">{object.name}</h1>
      {address !== '' ? <p className="text-sm text-slate-400">{address}</p> : null}
    </section>
  )
}

function FaultChips({
  entries,
  selected,
  onToggle,
}: {
  entries: FaultCatalogEntry[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation('ticket')

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('report.faults.label')}</legend>
      <p className="text-sm text-slate-400">{t('report.faults.hint')}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const active = selected.includes(entry.key)

          return (
            <button
              aria-pressed={active}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                active
                  ? 'border-sky-400 bg-sky-600/20 text-sky-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
              key={entry.key}
              type="button"
              onClick={() => onToggle(entry.key)}
            >
              {entry.text}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Optional short title of the report (WP-M2-90c) — only when `titleEnabled`. */
function TitleField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('ticket')

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor="report-title">{t('report.titleField.label')}</label>
      <input
        className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
        id="report-title"
        maxLength={200}
        name="title"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function FreeText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('ticket')

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor="report-text">{t('report.text.label')}</label>
      <textarea
        className="min-h-28 rounded bg-slate-900 p-2 text-slate-100"
        id="report-text"
        maxLength={TEXT_MAX_LENGTH}
        name="text"
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs text-slate-400">
        {t('report.text.counter', { used: value.length, max: TEXT_MAX_LENGTH })}
      </span>
    </div>
  )
}

function ContactFields({
  contact,
  onChange,
}: {
  contact: PublicReportContact
  onChange: (contact: PublicReportContact) => void
}) {
  const { t } = useTranslation('ticket')

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">{t('report.contact.hint')}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t('report.contact.name')}
        <input
          className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
          name="contactName"
          autoComplete="name"
          value={contact.name ?? ''}
          onChange={(event) => onChange({ ...contact, name: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('report.contact.phone')}
        <input
          className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
          name="contactPhone"
          type="tel"
          autoComplete="tel"
          value={contact.phone ?? ''}
          onChange={(event) => onChange({ ...contact, phone: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('report.contact.email')}
        <input
          className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
          name="contactEmail"
          type="email"
          autoComplete="email"
          value={contact.email ?? ''}
          onChange={(event) => onChange({ ...contact, email: event.target.value })}
        />
      </label>
      <p className="text-xs text-slate-500">{t('report.contact.privacy')}</p>
    </div>
  )
}

/**
 * The Altcha widget of the public form (`specs/06-report-form.md` §7.6, WP-M2-07d).
 *
 * The widget is a third-party web component: the `altcha` package registers
 * `<altcha-widget>` and it is loaded **only** when the server asked for a captcha.
 * The challenge of the API is handed over as its `challenge` attribute, and the
 * solved proof of work arrives as the `verified` event with a base64 payload.
 */
function AltchaCaptcha({
  challenge,
  onVerified,
}: {
  challenge: AltchaChallenge
  onVerified: (verification: AltchaVerification) => void
}) {
  const { t, i18n } = useTranslation('ticket')
  const widgetRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const widget = widgetRef.current

    if (widget === null) {
      return undefined
    }

    // The widget and its translations are loaded on demand: a reporter of a normal
    // report never downloads them.
    const language = i18n.language === 'en' ? 'en' : 'de'

    void import('altcha').catch(() => undefined)

    if (language === 'en') {
      void import('altcha/i18n/en').catch(() => undefined)
    } else {
      void import('altcha/i18n/de').catch(() => undefined)
    }

    widget.setAttribute('challenge', JSON.stringify(challenge))
    widget.setAttribute('language', language)

    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: string }>).detail
      const verification =
        typeof detail?.payload === 'string' ? verificationOf(detail.payload) : undefined

      if (verification !== undefined) {
        onVerified(verification)
      }
    }

    widget.addEventListener('verified', handleVerified)

    return () => {
      widget.removeEventListener('verified', handleVerified)
    }
  }, [challenge, i18n.language, onVerified])

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">{t('report.spam.captcha')}</p>
      <div className="min-h-11">
        <altcha-widget ref={widgetRef} />
      </div>
    </div>
  )
}

function Confirmation({ report, locale }: { report: PublicReport; locale: StandardTextLocale }) {
  const { t } = useTranslation('ticket')
  const deadline = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(report.deadlineAt))
  const statusHref = `/s/${report.statusToken}`

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
      <h1 className="text-xl font-semibold">{t('report.done.title')}</h1>
      <p className="text-sm text-slate-300">{t('report.done.lead')}</p>
      <p className="text-lg font-medium" data-testid="report-ticket-no">
        {t('report.done.ticketNo', { ticketNo: report.ticketNo })}
      </p>
      <p className="text-sm text-slate-400">{t('report.done.deadline', { deadline })}</p>
      {report.photoCount > 0 ? (
        <p className="text-sm text-slate-400">
          {t('report.done.photoCount', { count: report.photoCount })}
        </p>
      ) : null}
      {report.clockSkewed ? (
        <p className="text-sm text-amber-300">{t('report.done.clockSkewed')}</p>
      ) : null}
      <Link
        className="min-h-11 inline-flex items-center justify-center rounded bg-sky-700 px-4 font-medium text-white"
        data-testid="report-status-link"
        to={statusHref}
      >
        {t('report.done.statusLink')}
      </Link>
    </section>
  )
}

/**
 * The duplicate hint of the public form (`specs/06-report-form.md` §7.8, WP-M2-08).
 *
 * The plan asks for the two answers of §10: "report anyway" creates a new
 * ticket, "add to existing" appends the text of the reporter to the open ticket
 * as a comment event. The hint is a notice, not a blocker: the send button of
 * the form stays the way to report a malfunction.
 */
function DuplicateHint({
  tickets,
  locale,
  onAdd,
  onCreateAnyway,
  pending,
}: {
  tickets: PublicOpenTicket[]
  locale: StandardTextLocale
  onAdd: (ticket: PublicOpenTicket) => void
  onCreateAnyway: () => void
  pending: boolean
}) {
  const { t } = useTranslation('ticket')
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-amber-700 bg-amber-950/30 p-4"
      data-testid="duplicate-hint"
    >
      <p className="text-sm font-semibold text-amber-200">{t('report.duplicate.title')}</p>
      <p className="text-sm text-amber-100/80">{t('report.duplicate.hint')}</p>

      <ul className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
            key={ticket.ticketId}
          >
            <span className="flex flex-col">
              <span>
                {t('report.duplicate.ticket', {
                  ticketNo: ticket.ticketNo,
                  reportedAt: format(ticket.reportedAt),
                })}
              </span>
              <span className="text-xs text-amber-100/70">
                {t(`status.values.${ticket.status}`)}
              </span>
            </span>
            <button
              className="min-h-11 rounded border border-amber-500 px-3 text-amber-100 disabled:opacity-50"
              disabled={pending}
              type="button"
              onClick={() => onAdd(ticket)}
            >
              {t('report.duplicate.add')}
            </button>
          </li>
        ))}
      </ul>

      <button
        className="min-h-11 rounded bg-slate-700 px-3 text-slate-100 disabled:opacity-50"
        disabled={pending}
        type="button"
        onClick={onCreateAnyway}
      >
        {t('report.duplicate.createAnyway')}
      </button>
    </section>
  )
}

/** The confirmation of the "add to existing" path — no new ticket was created. */
function CommentConfirmation({
  comment,
  locale,
}: {
  comment: PublicTicketComment
  locale: StandardTextLocale
}) {
  const { t } = useTranslation('ticket')
  const at = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(comment.at),
  )

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4"
      data-testid="duplicate-comment-done"
    >
      <h1 className="text-xl font-semibold">{t('report.duplicate.addedTitle')}</h1>
      <p className="text-sm text-slate-300">{t('report.duplicate.addedLead')}</p>
      <p className="text-lg font-medium">{t('report.duplicate.added', { ticketNo: comment.ticketNo })}</p>
      <p className="text-sm text-slate-400">{t('report.duplicate.addedAt', { at })}</p>
    </section>
  )
}

export function ReportFormPage() {
  const { t, i18n } = useTranslation('ticket')
  const { token: pathToken } = useParams<{ token: string }>()
  const pathTokenValue = pathToken ?? ''
  const tokenIsValid = qrTokenSchema.safeParse(pathTokenValue).success
  const qr = usePublicQr(pathTokenValue)
  const locale = localeOf(i18n.language)
  const catalog = usePublicFaultCatalog(locale)
  const [photos, setPhotos] = useState<string[]>([])
  const [contact, setContact] = useState<PublicReportContact>({ name: '', phone: '', email: '' })
  /** The honeypot of §7.6: it stays empty for a human, a filled one flags the report. */
  const [website, setWebsite] = useState('')
  /** The solved proof of work — it is only asked for a suspicious report (§7.6). */
  const [verification, setVerification] = useState<AltchaVerification | undefined>(undefined)
  /** One idempotency key per opened form (§7.3.3): a retry never doubles the ticket. */
  const [clientUuid] = useState(() => globalThis.crypto.randomUUID())
  const [problems, setProblems] = useState<string[]>([])
  const [serverNotice, setServerNotice] = useState<string | undefined>(undefined)
  const [report, setReport] = useState<PublicReport | null>(null)
  /** The answer of the "add to existing" path (§7.8.2) — no new ticket. */
  const [comment, setComment] = useState<PublicTicketComment | null>(null)
  const [pending, setPending] = useState(false)
  /** A report was stored in the outbox while the device was offline. */
  const [offlineSaved, setOfflineSaved] = useState(false)
  /** How many reports wait in the outbox. */
  const [queuedCount, setQueuedCount] = useState(0)

  const refreshQueued = useCallback(async () => {
    if (!outboxAvailable()) {
      setQueuedCount(0)
      return
    }

    const count = (await queuedReports()).length
    setQueuedCount(count)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshQueued()
    }, 0)

    return () => clearTimeout(timer)
  }, [refreshQueued])

  const { challenge, request: requestChallenge } = useAltchaChallenge()

  const [faultKeys, setFaultKeys] = useState<string[]>([])
  const [text, setText] = useState('')
  /** The optional short title of WP-M2-90c — only rendered when `titleEnabled`. */
  const [title, setTitle] = useState('')

  const object = qr.data?.object
  /** WP-M2-90/90b: the object decides whether the form offers the title field. */
  const titleEnabled = qr.data?.titleEnabled === true
  const openTickets = useOpenTickets(qr.data?.token)
  const openTicketList = openTickets.data?.tickets ?? []
  /** The oldest open ticket carries the running fault, so it is the parent (§7.8.3). */
  const duplicateParentId = openTicketList[0]?.ticketId

  function toggleFault(key: string) {
    setFaultKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }

  /**
   * The client mirror of the server rules of §7.3.2 and §7.8.2. The contact is
   * mandatory for a report and optional for a comment — the office can ask the
   * reporter of the open ticket instead.
   */
  function validate(contactRequired: boolean): string[] {
    const found: string[] = []

    if (text.trim() === '' && faultKeys.length === 0) {
      found.push('report.validation.faultOrText')
    }

    const hasContact =
      (contact.phone ?? '').trim() !== '' || (contact.email ?? '').trim() !== ''

    if (contactRequired && !hasContact) {
      found.push('report.validation.contactRequired')
    } else if (hasContact && !publicReportContactSchema.safeParse(contact).success) {
      found.push('report.validation.email')
    }

    return found
  }

  /**
   * Sends the report. `proof` carries the solved captcha of §7.6 — it is only set
   * after the server asked for one, so a normal report never solves a puzzle.
   */
  const sendReport = useCallback(
    async (proof?: AltchaVerification) => {
      const trimmedText = text.trim()
      const body: PublicReportRequest = {
        // The resolved current token, never the scanned one of a retired sticker (§7.3).
        qrToken: qr.data?.token ?? pathTokenValue,
        clientUuid,
        // WP-M2-90c: the trimmed title only when the object enables it and it is filled.
        title: titleEnabled && title.trim() !== '' ? title.trim() : undefined,
        text: trimmedText === '' ? undefined : trimmedText,
        faultTemplateKeys: faultKeys,
        contact,
        reportedAt: new Date().toISOString(),
        locale,
        photos,
        // §7.6: the honeypot travels with every report, empty for a human.
        website,
        verification: proof,
        // §7.8.3: a new report of an object with an open ticket points at it.
        parentTicketId: duplicateParentId,
      }

      setProblems([])
      setServerNotice(undefined)
      setPending(true)

      try {
        if (!navigator.onLine) {
          // Offline: persist the report in the outbox and deliver it once the
          // connection returns (WP-M2-09). The `client_uuid` makes a retry
          // idempotent on the server.
          await enqueueReport(body)
          await refreshQueued()
          setOfflineSaved(true)
          return
        }

        setReport(
          await apiFetch<PublicReport>('/v1/public/tickets', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
          }),
        )
      } catch (error) {
        // A network failure (not an `ApiError`) means the report could not
        // reach the server — persist it and retry later.
        if (!(error instanceof ApiError)) {
          await enqueueReport(body)
          await refreshQueued()
          setOfflineSaved(true)
          setPending(false)
          return
        }

        setServerNotice(errorMessage(error))

        if (error.code === 'captcha_required') {
          // §7.6: only a suspicious report gets a captcha — the challenge is fetched
          // here and never before.
          try {
            await requestChallenge()
          } catch {
            setServerNotice('report.errors.unknown')
          }
        }
      } finally {
        setPending(false)
      }
    },
    [
      clientUuid,
      contact,
      duplicateParentId,
      faultKeys,
      locale,
      pathTokenValue,
      photos,
      qr.data?.token,
      qr.data?.titleEnabled,
      refreshQueued,
      requestChallenge,
      text,
      title,
      website,
    ],
  )

  /** The solved captcha is sent right away — the reporter does not press twice. */
  const handleVerified = useCallback(
    (proof: AltchaVerification) => {
      setVerification(proof)
      void sendReport(proof)
    },
    [sendReport],
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Client mirror of the server `422`s of §7.3.2, so the reporter sees the rule before
    // the round trip; the server still decides over the same schema.
    const found = validate(true)

    if (found.length > 0) {
      setProblems(found)
      setServerNotice(undefined)

      return
    }

    await sendReport(verification)
  }

  /**
   * "Trotzdem neu" (§7.8.3): the report is created anyway and points at the open
   * ticket of the object, so the office sees that it is a duplicate.
   */
  async function createAnyway() {
    const found = validate(true)

    if (found.length > 0) {
      setProblems(found)
      setServerNotice(undefined)

      return
    }

    await sendReport(verification)
  }

  /**
   * "Ergänzen" (§7.8.2): the text of the reporter is appended to the open ticket
   * as a comment event — no new ticket is created. The contact is optional here;
   * the office can ask the reporter of the open ticket instead.
   */
  async function addToExisting(ticket: PublicOpenTicket) {
    const qrToken = qr.data?.token

    if (qrToken === undefined) {
      return
    }

    const found = validate(false)

    if (found.length > 0) {
      setProblems(found)
      setServerNotice(undefined)

      return
    }

    const trimmedText = text.trim()

    setProblems([])
    setServerNotice(undefined)
    setPending(true)

    try {
      const answer = await apiFetch<PublicTicketComment>(
        `/v1/public/tickets/${encodeURIComponent(ticket.ticketNo)}/comments`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            qrToken,
            clientUuid,
            // SEC-004: the API needs the ticket's own status token — the reporter
            // only has it for the ticket they created from this form. For any
            // other open ticket the API answers 403 comment_status_token_mismatch
            // and this form shows the notice.
            statusToken: report?.statusToken ?? qrToken,
            // §7.6: honeypot + captcha ride the same session as the report.
            website,
            verification,
            text: trimmedText === '' ? undefined : trimmedText,
            faultTemplateKeys: faultKeys,
            contact,
            locale,
          }),
        },
      )

      setComment(answer)
    } catch (error) {
      setServerNotice(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  if (report !== null) {
    return (
      <main className="min-h-dvh bg-slate-950 p-4 text-slate-100">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <Confirmation locale={locale} report={report} />
        </div>
      </main>
    )
  }

  if (comment !== null) {
    return (
      <main className="min-h-dvh bg-slate-950 p-4 text-slate-100">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <CommentConfirmation comment={comment} locale={locale} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <span className="font-semibold tracking-tight">{t('common:app.title')}</span>
      </header>
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <h2 className="text-lg font-semibold">{t('report.title')}</h2>

        {!tokenIsValid ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('report.errors.qrTokenInvalid')}
          </p>
        ) : null}

        {tokenIsValid && qr.isPending ? (
          <p className="text-sm text-slate-400">{t('report.loading')}</p>
        ) : null}

        {tokenIsValid && qr.isError ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('report.errors.qr_token_not_found')}
          </p>
        ) : null}

        {object ? (
          <>
            <ObjectHeader object={object} />

            {/* §7.8: the duplicate hint — a notice with the two answers of the plan. */}
            {openTicketList.length > 0 ? (
              <DuplicateHint
                locale={locale}
                onAdd={(ticket) => void addToExisting(ticket)}
                onCreateAnyway={() => void createAnyway()}
                pending={pending}
                tickets={openTicketList}
              />
            ) : null}

            <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
              <FaultChips entries={catalog} onToggle={toggleFault} selected={faultKeys} />
              {titleEnabled ? <TitleField onChange={setTitle} value={title} /> : null}
              <FreeText onChange={setText} value={text} />
              <PhotoUpload
                photos={photos}
                onAdd={(photo) => setPhotos((current) => [...current, photo])}
                onRemove={(index) =>
                  setPhotos((current) => current.filter((_, position) => position !== index))
                }
              />
              <ContactFields contact={contact} onChange={setContact} />

              {/* §7.6: the honeypot is invisible for a human — no label, no tab stop. */}
              <input
                aria-hidden="true"
                autoComplete="off"
                className="sr-only"
                name="website"
                tabIndex={-1}
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />

              {problems.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm text-amber-300" role="alert">
                  {problems.map((problem) => (
                    <li key={problem}>{t(problem)}</li>
                  ))}
                </ul>
              ) : null}

              {serverNotice !== undefined ? (
                <p className="text-sm text-rose-400" role="alert">
                  {t(serverNotice)}
                </p>
              ) : null}

              {/* §7.6: the captcha appears only when the server asked for one. */}
              {challenge !== null ? (
                <AltchaCaptcha challenge={challenge} onVerified={handleVerified} />
              ) : null}

              {/* Offline: the report was persisted and waits for delivery. */}
              {offlineSaved ? (
                <p className="text-sm text-sky-300" role="status">
                  {t('report.offline.saved')}
                </p>
              ) : null}

              {/* §7.1 and PLAN §2: the notice sits directly above the send button. */}
              <p className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">
                {t('report.emergencyNotice')}
              </p>

              {/* How many reports wait in the outbox (offline path of WP-M2-09). */}
              {queuedCount > 0 ? (
                <p className="text-xs text-sky-300">
                  {t('report.offline.badge', { count: queuedCount })}
                </p>
              ) : null}

              <button
                className="min-h-12 rounded-lg bg-sky-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                disabled={pending}
                type="submit"
              >
                {pending ? t('report.submitting') : t('report.submit')}
              </button>

              {/* Send everything that is waiting in the outbox right now. */}
              {queuedCount > 0 && navigator.onLine && !pending ? (
                <button
                  className="min-h-12 rounded-lg border border-sky-500 px-4 py-3 text-base font-semibold text-sky-300 disabled:opacity-50"
                  disabled={pending}
                  type="button"
                  onClick={async () => {
                    setPending(true)
                    await replayOutbox()
                    await refreshQueued()
                    setOfflineSaved(false)
                    setPending(false)
                  }}
                >
                  {t('report.offline.sendNow')}
                </button>
              ) : null}
            </form>
          </>
        ) : null}
      </div>
    </main>
  )
}
