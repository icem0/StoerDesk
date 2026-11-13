import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BrandingResponse, TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiBaseUrl, apiFetch } from '../../lib/api'
import { i18n } from '../../i18n'
import { useFaultCatalog } from './use-fault-catalog'

/**
 * Prepared send view for a ticket (WP-M14-22) — it replaces the former E-Mail
 * and PDF views (`WP-M4-11`, `WP-M4-12`).
 *
 * The ticket detail header opens this view from its paper-plane button. The
 * branded ticket is prepared for both outgoing paths and two buttons sit on
 * top of the content: "Als PDF speichern" runs `window.print()` with the A4
 * print CSS, "E-Mail versenden" opens a prefilled `mailto:` link whose
 * subject and body carry the ticket number, object, description and a deep
 * link to the ticket detail. Every history event is rendered in full — date,
 * label, actor and the event text — and each block (every history row, every
 * photo, every field section) avoids page-break cuts (`print:break-inside-avoid`),
 * so nothing is truncated in the printout; photos load eagerly and show on
 * screen and in print.
 */

function useTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail-send', ticketNo],
    queryFn: () => apiFetch<TicketDetailResponse>(`/v1/tickets/${ticketNo ?? ''}`),
    enabled: ticketNo !== undefined,
    retry: false,
  })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  const locale = i18n.language === 'en' ? 'en-US' : 'de-DE'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-slate-900/30 text-slate-300',
  IN_REVIEW: 'bg-blue-900/30 text-blue-300',
  WORK_ORDER_CREATED: 'bg-amber-900/30 text-amber-300',
  OFFERED: 'bg-purple-900/30 text-purple-300',
  ASSIGNED: 'bg-indigo-900/30 text-indigo-300',
  ACCEPTED: 'bg-emerald-900/30 text-emerald-300',
  ACKNOWLEDGED: 'bg-emerald-900/60 text-emerald-200',
  CLOSED: 'bg-slate-500/30 text-slate-400',
  CANCELLED: 'bg-rose-900/30 text-rose-300',
}

export function TicketSendPage() {
  const { t, i18n } = useTranslation('ticket')
  const { t: tCommon } = useTranslation('common')
  const { ticketNo } = useParams()

  const branding = useQuery<BrandingResponse>({
    queryKey: ['branding-send'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })
  const ticketQuery = useTicket(ticketNo)

  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)
  const faultLabels = Object.fromEntries(catalog.map((entry) => [entry.key, entry.text]))

  if (ticketQuery.isPending) {
    return <p className="text-slate-400">{t('detail.loading')}</p>
  }
  if (ticketQuery.isError || branding.isError) {
    return <p className="text-rose-400 text-sm" role="alert">{t('pdf.notFound')}</p>
  }

  const ticket = ticketQuery.data?.ticket
  const photos = ticketQuery.data?.photos ?? []
  const events = ticketQuery.data?.events ?? []
  const companyName = branding.data?.companyName ?? ''
  const logo = branding.data?.logo ?? ''

  if (!ticket) {
    return <p className="text-rose-400 text-sm" role="alert">{t('pdf.notFound')}</p>
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const ticketUrl = `${origin}/tickets/${ticketNo}`
  const subject = t('email.subject', { ticketNo: ticket.ticketNo })
  /** Real newlines: `encodeURIComponent` turns them into `%0A` once, so the
   * e-mail client receives line breaks, never a literal `%0A` in the body. */
  const body = [
    t('email.bodyGreeting'),
    '',
    t('email.bodyTicket', { ticketNo: ticket.ticketNo }),
    ...(ticket.title !== null ? [`${t('detail.field.title')}: ${ticket.title}`] : []),
    t('email.bodyObject', { object: ticket.objectName, objectNo: ticket.objectNo }),
    ...(ticket.faultTemplateKeys.length > 0
      ? [`${t('pdf.fieldFaults')}: ${ticket.faultTemplateKeys.map((key) => faultLabels[key] ?? key).join(', ')}`]
      : []),
    t('email.bodyStatus', { status: t(`status.values.${ticket.status}`) ?? ticket.status }),
    t('email.bodyPriority', { priority: t(`priority.${ticket.priority}`) ?? ticket.priority }),
    t('email.bodyReported', { reportedAt: formatDate(ticket.reportedAt) }),
    ...(ticket.deadlineAt !== null && ticket.deadlineAt !== undefined
      ? [`${t('pdf.deadlineAt')}: ${formatDate(ticket.deadlineAt)}`]
      : []),
    ...(ticket.description !== null ? [t('email.bodyDescription', { description: ticket.description })] : []),
    '',
    ticketUrl,
  ].join('\n')

  return (
    <section className="ticket-pdf flex flex-col gap-4">
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        .ticket-pdf {
          max-width: 210mm;
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          {logo ? (
            <img
              src={logo}
              alt={tCommon('branding.field.logo')}
              className="h-10 w-auto mb-2"
              decoding="async"
            />
          ) : null}
          <div className="text-sm text-slate-400">
            {companyName ? companyName : tCommon('app.title')}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">{t('pdf.title', { ticketNo: ticket.ticketNo })}</h1>
        </div>
      </div>

      {/* Two buttons on top of the prepared view: PDF and e-mail. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 print:hidden"
          onClick={() => window.print()}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2a2 2 0 012 2v0a2 2 0 012-2zM16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          {t('pdf.save')}
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
          className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 print:hidden"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m22 2-11 16-7-12 22-4z" />
          </svg>
          {t('email.write')}
        </a>
      </div>

      <table className="w-full border-collapse border border-slate-700">
        <tbody>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 w-1/3">
              {t('pdf.object')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 font-medium">
              {ticket.objectName}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.objectNo')}
            </td>
            <td className="px-3 py-2 text-sm font-mono text-slate-200">
              {ticket.objectNo}
            </td>
          </tr>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.status')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
              >
                {t(`status.values.${ticket.status}`) ?? ticket.status}
              </span>
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.priority')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {t(`priority.${ticket.priority}`) ?? ticket.priority}
            </td>
          </tr>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.reportedAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {formatDate(ticket.reportedAt)}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.deadlineAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {formatDate(ticket.deadlineAt)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.erfasser')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs" colSpan={3}>
              {ticket.recordedBy ?? t('detail.field.system')}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.source')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs" colSpan={3}>
              {t(`detail.source.${ticket.source.toLowerCase()}`, {
                defaultValue: ticket.source,
              })}
            </td>
          </tr>
        </tbody>
      </table>

      {ticket.title !== null && (
        <div className="mt-4 print:break-inside-avoid">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {t('pdf.fieldTitle')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">{ticket.title}</p>
        </div>
      )}
      {ticket.description !== null && (
        <div className="mt-4 print:break-inside-avoid">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {t('pdf.fieldDescription')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">{ticket.description}</p>
        </div>
      )}
      {ticket.faultTemplateKeys.length > 0 && (
        <div className="mt-4 print:break-inside-avoid">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {t('pdf.fieldFaults')}
          </label>
          <div className="flex flex-wrap gap-2">
            {ticket.faultTemplateKeys.map((key) => (
              <span key={key} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                {faultLabels[key] ?? key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Photos: show on screen and in print, never cut at a page break. */}
      {photos.length > 0 && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            {t('pdf.photos')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {photos.map((photo, index) => {
              const url = `${apiBaseUrl}/v1/tickets/${ticketNo}/photos/${photo.id}`
              return (
                <div
                  key={photo.id}
                  className="aspect-[4/3] rounded overflow-hidden border border-slate-700 bg-slate-800 print:break-inside-avoid"
                >
                  <img
                    src={url}
                    alt={t('detail.photos.alt', { index: index + 1 })}
                    className="w-full h-full object-cover"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* History: every event in full — date, label, actor and event text. */}
      <div className="mt-4">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {t('pdf.history')}
        </label>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">{t('pdf.historyEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {events.map((event) => {
              const actor =
                event.actorKind === 'user'
                  ? (event.actorName ?? t('detail.field.unknown'))
                  : event.actorKind === 'public'
                    ? t('detail.actor.external', {
                        name: event.actorName ?? t('detail.field.unknown'),
                      })
                    : t(`actorKind.${event.actorKind}`, { defaultValue: event.actorKind })
              const text = typeof event.payload.text === 'string' ? event.payload.text : typeof event.payload.reason === 'string' ? event.payload.reason : null
              return (
                <div key={event.id} className="flex gap-3 rounded border border-slate-700 px-3 py-2 print:break-inside-avoid">
                  <div className="w-36 shrink-0 whitespace-nowrap text-xs font-mono text-slate-500">
                    {formatDate(event.createdAt)}
                  </div>
                  <div className="flex-1 flex-col gap-1">
                    <div className="text-sm font-medium text-slate-200">
                      {t(`status.events.${event.type}`, { defaultValue: event.type })}
                    </div>
                    <div className="text-xs text-slate-400">{actor}</div>
                    {text !== null && text.trim() !== '' ? (
                      <p className="text-xs whitespace-pre-wrap text-slate-300">{text}</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
