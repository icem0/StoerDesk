import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { qrTokenSchema, type PublicTicketStatus } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Public status page at `/s/:token` (`specs/06-report-form.md` §7.3.4/§7.7, WP-M2-06b).
 *
 * The reporter follows the status link of the confirmation page and has no session,
 * so the page is **not** a child of the `Shell` — it must never show the login form.
 * The status token is the only key; the API of WP-M2-06 already filters the timeline
 * to the public event types and never sends payloads or contact data.
 */

function usePublicStatus(token: string) {
  return useQuery({
    queryKey: ['public-ticket-status', token],
    queryFn: () => apiFetch<PublicTicketStatus>(`/v1/public/tickets/${token}/status`),
    enabled: qrTokenSchema.safeParse(token).success,
    retry: false,
  })
}

function StatusDetails({ status, locale }: { status: PublicTicketStatus; locale: 'de' | 'en' }) {
  const { t } = useTranslation('ticket')
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {t('status.ticketNo', { ticketNo: status.ticketNo })}
        </h1>
        <span
          className="rounded-full border border-sky-700 bg-sky-950/60 px-3 py-1 text-sm font-medium text-sky-200"
          data-testid="status-badge"
        >
          {t(`status.values.${status.status}`)}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-slate-300">
        <div>
          <dt className="inline text-slate-400">{t('status.reportedAtLabel')} </dt>
          <dd className="inline">{format(status.reportedAt)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">{t('status.deadlineLabel')} </dt>
          <dd className="inline">{format(status.deadlineAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('status.timeline')}</h2>
        <ol className="flex flex-col gap-3">
          {status.events.map((event, index) => (
            <li
              className="flex flex-col gap-0.5 border-l-2 border-slate-700 pl-3"
              key={`${event.type}-${event.at}-${index}`}
            >
              <span className="text-sm font-medium">{t(`status.events.${event.type}`)}</span>
              <time className="text-xs text-slate-400" dateTime={event.at}>
                {format(event.at)}
              </time>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function StatusPage() {
  const { t, i18n } = useTranslation('ticket')
  const { token: pathToken } = useParams<{ token: string }>()
  const token = pathToken ?? ''
  const tokenIsValid = qrTokenSchema.safeParse(token).success
  const status = usePublicStatus(token)
  const locale = i18n.language === 'en' ? 'en' : 'de'

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <span className="font-semibold tracking-tight">{t('common:app.title')}</span>
      </header>
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <h2 className="text-lg font-semibold">{t('status.title')}</h2>

        {!tokenIsValid ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('status.errors.invalidToken')}
          </p>
        ) : null}

        {tokenIsValid && status.isPending ? (
          <p className="text-sm text-slate-400">{t('status.loading')}</p>
        ) : null}

        {tokenIsValid && status.isError ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('status.errors.not_found')}
          </p>
        ) : null}

        {status.data ? <StatusDetails locale={locale} status={status.data} /> : null}
      </div>
    </main>
  )
}
