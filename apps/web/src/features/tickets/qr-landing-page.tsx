import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { qrTokenSchema } from '@stoerdesk/shared'
import type { PublicOpenTickets, PublicQrObject, QrResolveResponse } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * The landing page of a QR code at `/m/:token` (`specs/06-report-form.md`
 * §7.10.2, ADR-0061).
 *
 * The scan of a code leads to the **open ticket** of the object, not to the
 * form: a fault that is not gone is scanned a second time, and the reporter
 * shall see the ticket that is open. The report form is one tap away
 * (`/m/:token/neu`).
 *
 * The page lies outside the shell of the app — a reporter never sees the login
 * form. It shows the object and the open tickets of the object, never the
 * description, the contact or the photos of another reporter.
 */

function usePublicQr(token: string) {
  return useQuery({
    queryKey: ['public-qr', token],
    queryFn: () => apiFetch<QrResolveResponse>(`/v1/public/qr/${token}`),
    enabled: qrTokenSchema.safeParse(token).success,
    retry: false,
  })
}

/**
 * The open tickets of the object (`specs/06-report-form.md` §7.8.1). The
 * answer carries the number, the status and the time — never more.
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

function addressLine(object: PublicQrObject): string {
  const street = [object.street ?? '', object.houseNumber ?? ''].join(' ').trim()
  const place = [object.postalCode ?? '', object.city ?? ''].join(', ').trim()

  return [street, place].filter((part) => part !== '').join(', ')
}

export function QrLandingPage() {
  const { t, i18n } = useTranslation('ticket')
  const { token: pathToken } = useParams<{ token: string }>()
  const token = pathToken ?? ''
  const tokenIsValid = qrTokenSchema.safeParse(token).success
  const qr = usePublicQr(token)
  const open = useOpenTickets(tokenIsValid ? token : undefined)
  const locale = i18n.language === 'en' ? 'en' : 'de'

  const object = qr.data?.object
  // The open tickets come oldest first (§7.8.1); the **newest** one is the
  // main card of the page.
  const tickets = [...(open.data?.tickets ?? [])].reverse()
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <span className="font-semibold tracking-tight">{t('common:app.title')}</span>
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <h2 className="text-lg font-semibold">{t('report.landing.title')}</h2>

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
          <section className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{object.objectNo}</p>
            <h1 className="text-xl font-semibold">{object.name}</h1>
            {addressLine(object) !== '' ? (
              <p className="text-sm text-slate-400">{addressLine(object)}</p>
            ) : null}
          </section>
        ) : null}

        {tickets.length > 0 ? (
          <>
            <p className="text-sm text-slate-300">{t('report.landing.openHint')}</p>

            <section className="flex flex-col gap-3">
              {tickets.map((ticket, index) => (
                <article
                  className="flex flex-col gap-2 rounded-lg border border-amber-700 bg-amber-950/30 p-4"
                  data-testid={index === 0 ? 'landing-open-ticket' : 'landing-open-ticket'}
                  key={ticket.ticketId}
                >
                  <p className="text-sm font-semibold text-amber-200">
                    {t('report.landing.ticket', {
                      ticketNo: ticket.ticketNo,
                      reportedAt: format(ticket.reportedAt),
                    })}
                  </p>
                  <p className="text-xs text-amber-100/70">{t(`status.values.${ticket.status}`)}</p>
                  <Link
                    className="min-h-11 rounded border border-amber-500 px-3 py-2 text-center text-amber-100"
                    to={`/m/${token}/tickets/${ticket.ticketNo}`}
                  >
                    {t('report.landing.open')}
                  </Link>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {tokenIsValid && open.isPending ? (
          <p className="text-sm text-slate-400">{t('report.loading')}</p>
        ) : null}

        {tokenIsValid && !open.isPending && tickets.length === 0 && object ? (
          <p className="text-sm text-slate-300">{t('report.landing.noOpenTicket')}</p>
        ) : null}

        <Link
          className="min-h-11 rounded bg-sky-800 px-3 py-2 text-center text-slate-100"
          data-testid="landing-new-report"
          to={`/m/${token}/neu`}
        >
          {tickets.length > 0 ? t('report.landing.newReport') : t('report.landing.report')}
        </Link>
      </div>
    </main>
  )
}
