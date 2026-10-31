import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  publicReportContactSchema,
  qrTokenSchema,
  STANDARD_TEXTS,
  STANDARD_TEXT_KEYS,
} from '@stoerdesk/shared'
import type {
  PublicQrObject,
  PublicReport,
  PublicReportContact,
  PublicReportRequest,
  QrResolveResponse,
  StandardTextLocale,
} from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * Public report form at `/m/:token` (`specs/06-report-form.md` §7.1–§7.3, WP-M2-05).
 *
 * A reporter arrives from a QR code with no session, so this page is **not** a child of
 * the `Shell` — it must never show the login form. The token is resolved through
 * `GET /api/v1/public/qr/:token` first, so the submit body always carries the current
 * token of a retired one (§7.3), and one `client_uuid` per opened form makes a retry
 * idempotent (§7.3.3). Photos are WP-M2-05b, the status page `/s/:token` is WP-M2-06.
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
] as const

function usePublicQr(token: string) {
  return useQuery({
    queryKey: ['public-qr', token],
    queryFn: () => apiFetch<QrResolveResponse>(`/v1/public/qr/${token}`),
    enabled: qrTokenSchema.safeParse(token).success,
    retry: false,
  })
}

function localeOf(language: string): StandardTextLocale {
  return language === 'en' ? 'en' : 'de'
}

/**
 * The fault chips are the localized standard templates of §7.2 — the same catalog the
 * demo seed writes into `text_templates` (`specs/02-data-model.md` §4.5), not literals of
 * this component. A public text-template endpoint is phase 10.
 */
function faultCatalog(locale: StandardTextLocale): Record<string, string> {
  return Object.fromEntries(STANDARD_TEXTS[locale].map((entry) => [entry.key, entry.text]))
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
  const { t } = useTranslation('ticket')
  const address = addressLine(object)

  return (
    <section className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{object.objectNo}</p>
      <h1 className="text-xl font-semibold">{object.name}</h1>
      {address !== '' ? <p className="text-sm text-slate-400">{address}</p> : null}
      {object.systems.length === 0 ? (
        <p className="text-sm text-slate-400">{t('report.object.noSystems')}</p>
      ) : null}
    </section>
  )
}

function SystemSelect({
  object,
  value,
  onChange,
}: {
  object: PublicQrObject
  value: string
  onChange: (systemId: string) => void
}) {
  const { t } = useTranslation('ticket')

  if (object.systems.length === 0) {
    return null
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      {t('report.object.system')}
      <select
        className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
        name="system"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('report.object.systemNone')}</option>
        {object.systems.map((system) => {
          const optionLabel = `${system.label} (${system.type})`

          return (
            <option key={system.id} value={system.id}>
              {optionLabel}
            </option>
          )
        })}
      </select>
    </label>
  )
}

function FaultChips({
  labels,
  selected,
  onToggle,
}: {
  labels: Record<string, string>
  selected: string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation('ticket')

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('report.faults.label')}</legend>
      <p className="text-sm text-slate-400">{t('report.faults.hint')}</p>
      <div className="flex flex-wrap gap-2">
        {STANDARD_TEXT_KEYS.map((key) => {
          const active = selected.includes(key)
          const label = labels[key] ?? key

          return (
            <button
              aria-pressed={active}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                active
                  ? 'border-sky-400 bg-sky-600/20 text-sky-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
              key={key}
              type="button"
              onClick={() => onToggle(key)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </fieldset>
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

export function ReportFormPage() {
  const { t, i18n } = useTranslation('ticket')
  const { token: pathToken } = useParams<{ token: string }>()
  const pathTokenValue = pathToken ?? ''
  const tokenIsValid = qrTokenSchema.safeParse(pathTokenValue).success
  const qr = usePublicQr(pathTokenValue)
  const locale = localeOf(i18n.language)
  const labels = faultCatalog(locale)
  const [systemChoice, setSystemChoice] = useState<string | undefined>(undefined)
  const [faultKeys, setFaultKeys] = useState<string[]>([])
  const [text, setText] = useState('')
  const [contact, setContact] = useState<PublicReportContact>({ name: '', phone: '', email: '' })
  /** One idempotency key per opened form (§7.3.3): a retry never doubles the ticket. */
  const [clientUuid] = useState(() => globalThis.crypto.randomUUID())
  const [problems, setProblems] = useState<string[]>([])
  const [serverNotice, setServerNotice] = useState<string | undefined>(undefined)
  const [report, setReport] = useState<PublicReport | null>(null)
  const [pending, setPending] = useState(false)

  const object = qr.data?.object
  const systems = object?.systems ?? []
  const defaultSystemId = systems.length === 1 ? (systems[0]?.id ?? '') : ''
  const selectedSystemId = systemChoice ?? defaultSystemId

  function toggleFault(key: string) {
    setFaultKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedText = text.trim()
    const found: string[] = []

    // Client mirror of the server `422`s of §7.3.2, so the reporter sees the rule before
    // the round trip; the server still decides over the same schema.
    if (trimmedText === '' && faultKeys.length === 0) {
      found.push('report.validation.faultOrText')
    }

    if ((contact.phone ?? '').trim() === '' && (contact.email ?? '').trim() === '') {
      found.push('report.validation.contactRequired')
    } else if (!publicReportContactSchema.safeParse(contact).success) {
      found.push('report.validation.email')
    }

    if (found.length > 0) {
      setProblems(found)
      setServerNotice(undefined)

      return
    }

    const body: PublicReportRequest = {
      // The resolved current token, never the scanned one of a retired sticker (§7.3).
      qrToken: qr.data?.token ?? pathTokenValue,
      clientUuid,
      text: trimmedText === '' ? undefined : trimmedText,
      faultTemplateKeys: faultKeys,
      systemId: selectedSystemId === '' ? undefined : selectedSystemId,
      contact,
      reportedAt: new Date().toISOString(),
      locale,
      photos: [],
    }

    setProblems([])
    setServerNotice(undefined)
    setPending(true)

    try {
      setReport(
        await apiFetch<PublicReport>('/v1/public/tickets', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify(body),
        }),
      )
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
            <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
              <SystemSelect object={object} onChange={setSystemChoice} value={selectedSystemId} />
              <FaultChips labels={labels} onToggle={toggleFault} selected={faultKeys} />
              <FreeText onChange={setText} value={text} />
              <ContactFields contact={contact} onChange={setContact} />

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

              {/* §7.1 and PLAN §2: the notice sits directly above the send button. */}
              <p className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">
                {t('report.emergencyNotice')}
              </p>

              <button
                className="min-h-12 rounded-lg bg-sky-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                disabled={pending}
                type="submit"
              >
                {pending ? t('report.submitting') : t('report.submit')}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  )
}
