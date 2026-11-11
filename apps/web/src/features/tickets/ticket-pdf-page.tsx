import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BrandingResponse, TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiBaseUrl, apiFetch } from '../../lib/api'
import { i18n } from '../../i18n'
import { useFaultCatalog } from './use-fault-catalog'

/**
 * Branded PDF view for a ticket (`PLAN.md` §4/§11/§14, WP-M4-11).
 *
 * Renders a clean single-column print-optimized ticket (company logo + name
 * from the branding settings, ticket number, object, times, description,
 * faults, photos as images, history). `@media print` hides the shell, sets A4
 * page size and margins. A "Save as PDF" button triggers `window.print()`;
 * `Ctrl+P`/`Cmd+P` works too.
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

      <button
        className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 print:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
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
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {ticket.recordedBy ?? t('detail.field.system')}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500">
              {t('pdf.source')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {t(`detail.source.${ticket.source.toLowerCase()}`, {
                defaultValue: ticket.source,
              })}
            </td>
          </tr>
        </tbody>
      </table>

      {ticket.title !== null && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {t('pdf.fieldTitle')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">
            {ticket.title}
          </p>
        </div>
      )}
      {ticket.description !== null && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {t('pdf.fieldDescription')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">
            {ticket.description}
          </p>
        </div>
      )}
      {ticket.faultTemplateKeys.length > 0 && (
        <div className="mt-4">
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
      {photos.length > 0 && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            {t('pdf.photos')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {photos.map((photo, index) => {
              const url = `${apiBaseUrl}/v1/tickets/${ticketNo}/photos/${photo.id}`
              return (
                <div key={photo.id} className="aspect-[4/3] rounded overflow-hidden border border-slate-700 bg-slate-800">
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
        </div>
      )}

      <div className="mt-4 print:break-inside-avoid">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {t('pdf.history')}
        </label>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">{t('pdf.historyEmpty')}</p>
        ) : (
          <table className="w-full border-collapse border border-slate-700 mt-1">
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-700 last:border-0">
                  <td className="px-3 py-1 text-xs font-medium text-slate-500 w-1/3">
                    {formatDate(event.createdAt)}
                  </td>
                  <td className="px-3 py-1 text-xs text-slate-200">
                    {t(`status.events.${event.type}`, { defaultValue: event.type })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
