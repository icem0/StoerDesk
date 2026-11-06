import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BrandingResponse, TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { i18n } from '../../i18n'
import { useFaultCatalog } from './use-fault-catalog'

/**
 * Branded PDF view for a ticket (`PLAN.md` §4/§11, WP-M4-11).
 *
 * Renders a single-column, print-optimized ticket: company logo and name from
 * the branding settings, then the ticket fields, photos and history. A
 * `@media print` block hides the shell/header/navigation and sizes the page to
 * A4, so the browser's "Drucken → Als PDF speichern" produces a clean branded
 * PDF. A visible "Save as PDF" button triggers `window.print()`.
 */

function useTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail-pdf', ticketNo],
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

export function TicketPdfPage() {
  const { t, i18n } = useTranslation('ticket')
  const { t: tCommon } = useTranslation('common')
  const { ticketNo } = useParams()

  const branding = useQuery<BrandingResponse>({
    queryKey: ['branding-pdf'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })
  const ticketQuery = useTicket(ticketNo)

  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)

  if (ticketQuery.isPending) {
    return <p className="text-slate-400">{t('detail.loading')}</p>
  }
  if (ticketQuery.isError || branding.isError) {
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  const ticket = ticketQuery.data?.ticket
  const photos = ticketQuery.data?.photos ?? []
  const events = ticketQuery.data?.events ?? []
  const companyName = branding.data?.companyName ?? ''
  const logo = branding.data?.logo ?? ''
  const title = companyName ? `${companyName} · StörDesk` : 'StörDesk'

  if (!ticket) {
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  const faultLabels = Object.fromEntries(catalog.map((entry) => [entry.key, entry.text]))

  return (
    <section className="flex flex-col gap-4 print:flex-col print:gap-2">
      {/* Header: visible on screen, also part of the printed page */}
      <div className="print:break-inside-avoid mb-6 print:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 print:flex-row print:items-start print:justify-between">
          <div>
            {logo ? (
              <>
                <img
                  src={logo}
                  alt={tCommon('branding.field.logo')}
                  className="h-10 w-auto mb-2 print:h-8 print:mb-1"
                  decoding="async"
                />
                <div className="text-sm text-slate-400 print:text-slate-500 print:text-xs">
                  {companyName ? companyName : tCommon('app.title')}
                </div>
              </>
            ) : null}
          </div>
          <div className="text-right print:text-right">
            <h1 className="text-2xl font-bold print:text-xl print:mb-1">{title}</h1>
            <p className="text-sm font-medium text-slate-700 print:text-slate-600">
              {t('pdf.title', { ticketNo: ticket.ticketNo })}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-500 print:text-slate-600 print:text-xs mt-2 print:mt-1">
          {t('pdf.printHint')}
        </p>
      </div>

      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 print:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm-6-9.5V14a2 2 0 002 2h6a2 2 0 002-2v-3.586a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0013.586 9H13a1 1 0 001-1v-1a1 1 0 00-1-1H7a1 1 0 00-1 1v1a1 1 0 001 1z" />
        </svg>
        {t('pdf.save')}
      </button>

      {/* Ticket data table */}
      <table className="w-full border-collapse border border-slate-700 print:border-slate-300">
        <tbody>
          <tr className="border-b border-slate-700 print:border-slate-300">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs w-1/3">
              {t('pdf.object')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs font-medium">
              {ticket.objectName}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.objectNo')}
            </td>
            <td className="px-3 py-2 text-sm font-mono text-slate-200 print:text-slate-800 print:text-xs">
              {ticket.objectNo}
            </td>
          </tr>
          <tr className="border-b border-slate-700 print:border-slate-300">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.status')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}>
                {t(`status.values.${ticket.status}`) ?? ticket.status}
              </span>
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.priority')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs">
              {t(`priority.${ticket.priority}`) ?? ticket.priority}
            </td>
          </tr>
          <tr className="border-b border-slate-700 print:border-slate-300">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.reportedAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs">
              {formatDate(ticket.reportedAt)}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.deadlineAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs">
              {formatDate(ticket.deadlineAt)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.erfasser')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs" colSpan={3}>
              {ticket.recordedBy ?? t('detail.field.system')}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs">
              {t('pdf.source')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 print:text-slate-800 print:text-xs" colSpan={3}>
              {t(`detail.source.${ticket.source}`) ?? ticket.source}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Title */}
      {ticket.title !== null && (
        <div className="print:break-inside-avoid mt-4 print:mt-2">
          <label className="text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs uppercase tracking-wider">
            {t('detail.field.title')}
          </label>
          <p className="text-sm text-slate-200 print:text-slate-800 print:text-xs whitespace-pre-wrap">{ticket.title}</p>
        </div>
      )}

      {/* Description */}
      {ticket.description !== null && (
        <div className="print:break-inside-avoid mt-4 print:mt-2">
          <label className="text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs uppercase tracking-wider">
            {t('detail.field.description')}
          </label>
          <p className="text-sm text-slate-200 print:text-slate-800 print:text-xs whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Faults */}
      {ticket.faultTemplateKeys.length > 0 && (
        <div className="print:break-inside-avoid mt-4 print:mt-2">
          <label className="text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs uppercase tracking-wider">
            {t('detail.field.faults')}
          </label>
          <div className="flex flex-wrap gap-2 print:flex-wrap">
            {ticket.faultTemplateKeys.map((key) => (
              <span key={key} className="rounded bg-slate-700 print:bg-slate-300 px-2 py-1 text-xs text-slate-200 print:text-slate-800">
                {faultLabels[key] ?? key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="print:break-inside-avoid mt-4 print:mt-2">
        <label className="text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs uppercase tracking-wider mb-2 print:mb-1">
          {t('detail.photos.title')}
        </label>
        {photos.length === 0 ? (
          <p className="text-sm text-slate-400 print:text-slate-500 print:text-xs">{t('pdf.noPhotos')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3 print:grid-cols-3">
            {photos.map((photo, index) => {
              const url = `/api/v1/tickets/${ticketNo}/photos/${photo.id}`
              return (
                <div key={photo.id} className="aspect-[4/3] rounded overflow-hidden border border-slate-700 print:border-slate-300 bg-slate-800 print:bg-white">
                  <img
                    src={url}
                    alt={t('detail.photos.alt', { index: index + 1 })}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="print:break-inside-avoid mt-4 print:mt-2">
        <label className="text-xs font-medium text-slate-500 print:text-slate-600 print:text-xs uppercase tracking-wider mb-2 print:mb-1">
          {t('detail.history')}
        </label>
        <div className="border border-slate-700 print:border-slate-300 rounded divide-y divide-slate-700 print:divide-slate-300">
          {events.length === 0 ? (
            <p className="p-3 text-slate-400 print:text-slate-500 print:text-xs">{t('detail.historyEmpty')}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="p-3 flex gap-3 print:p-2 print:text-xs">
                <div className="w-24 shrink-0 whitespace-nowrap print:w-20">
                  <span className="text-xs font-mono text-slate-500 print:text-slate-600 print:text-[10px]">
                    {formatDate(event.createdAt)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200 print:text-slate-800 print:text-xs">
                    {t(`status.events.${event.type}`) ?? event.type}
                  </div>
                  <div className="text-xs text-slate-400 print:text-slate-600 print:text-[10px]">
                    {event.actorName !== null ? event.actorName : t(`actorKind.${event.actorKind}`) ?? event.actorKind}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
