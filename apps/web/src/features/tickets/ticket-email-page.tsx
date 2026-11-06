import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { BrandingResponse, TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { i18n } from '../../i18n'
import { useFaultCatalog } from './use-fault-catalog'

/**
 * Branded E-Mail view for a ticket (`PLAN.md` §4/§14, WP-M4-12).
 *
 * Renders a clean branded ticket preview (company logo + name from the
 * branding settings, ticket fields, photos) and a prefilled `mailto:` link
 * whose subject and body carry the ticket number, object, description and a
 * deep link to the ticket detail page. A button opens the user's e-mail
 * client so the ticket can be sent by e-mail.
 */

function useTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail-email', ticketNo],
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

export function TicketEmailPage() {
  const { t, i18n } = useTranslation('ticket')
  const { t: tCommon } = useTranslation('common')
  const { ticketNo } = useParams()

  const branding = useQuery<BrandingResponse>({
    queryKey: ['branding-email'],
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
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  const ticket = ticketQuery.data?.ticket
  const photos = ticketQuery.data?.photos ?? []
  const companyName = branding.data?.companyName ?? ''
  const logo = branding.data?.logo ?? ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const ticketUrl = `${origin}/tickets/${ticketNo}`

  if (!ticket) {
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  const subject = t('email.subject', { ticketNo: ticket.ticketNo })
  const body = [
    t('email.bodyGreeting'),
    '',
    t('email.bodyTicket', { ticketNo: ticket.ticketNo }),
    t('email.bodyObject', { object: ticket.objectName, objectNo: ticket.objectNo }),
    t('email.bodyStatus', { status: t(`status.values.${ticket.status}`) ?? ticket.status }),
    t('email.bodyPriority', { priority: t(`priority.${ticket.priority}`) ?? ticket.priority }),
    t('email.bodyReported', { reportedAt: formatDate(ticket.reportedAt) }),
    ticket.description !== null ? t('email.bodyDescription', { description: ticket.description }) : '',
    '',
    ticketUrl,
  ]
    .filter((line) => line !== '')
    .join('%0A')

  return (
    <section className="flex flex-col gap-4">
      <div className="print:break-inside-avoid mb-6">
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
            <div className="text-sm text-slate-400 text-xs">
              {companyName ? companyName : tCommon('app.title')}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-xl mb-1">{t('email.title')}</h1>
            <p className="text-sm font-medium text-slate-700 text-slate-600">
              {t('email.title', { ticketNo: ticket.ticketNo })}
            </p>
          </div>
        </div>
      </div>

      <a
        href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
        className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8l-5-6.66a2 2 0 00-2.22 0L3 8z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8l-5-6.66a2 2 0 00-2.22 0L3 8z" />
        </svg>
        {t('email.write')}
      </a>

      <table className="w-full border-collapse border border-slate-700">
        <tbody>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs w-1/3">
              {t('email.object')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 font-medium">
              {ticket.objectName}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.objectNo')}
            </td>
            <td className="px-3 py-2 text-sm font-mono text-slate-200 text-xs">
              {ticket.objectNo}
            </td>
          </tr>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.status')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}>
                {t(`status.values.${ticket.status}`) ?? ticket.status}
              </span>
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.priority')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {t(`priority.${ticket.priority}`) ?? ticket.priority}
            </td>
          </tr>
          <tr className="border-b border-slate-700">
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.reportedAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {formatDate(ticket.reportedAt)}
            </td>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.deadlineAt')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs">
              {formatDate(ticket.deadlineAt)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.erfasser')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs" colSpan={3}>
              {ticket.recordedBy ?? t('detail.field.system')}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-xs font-medium text-slate-500 text-xs">
              {t('email.source')}
            </td>
            <td className="px-3 py-2 text-sm text-slate-200 text-xs" colSpan={3}>
              {t(`detail.source.${ticket.source}`) ?? ticket.source}
            </td>
          </tr>
        </tbody>
      </table>

      {ticket.title !== null && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 text-xs uppercase tracking-wider">
            {t('detail.field.title')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">{ticket.title}</p>
        </div>
      )}
      {ticket.description !== null && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 text-xs uppercase tracking-wider">
            {t('detail.field.description')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap text-xs">{ticket.description}</p>
        </div>
      )}
      {ticket.faultTemplateKeys.length > 0 && (
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-500 text-xs uppercase tracking-wider">
            {t('detail.field.faults')}
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
          <label className="text-xs font-medium text-slate-500 text-xs uppercase tracking-wider mb-2">
            {t('detail.photos.title')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {photos.map((photo, index) => {
              const url = `/api/v1/tickets/${ticketNo}/photos/${photo.id}`
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
    </section>
  )
}
