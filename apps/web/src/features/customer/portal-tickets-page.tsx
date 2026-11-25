import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import type { CustomerObject, CustomerTicketDetail, CustomerTicketSummary } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * The portal of the customer (`specs/19-customer-portal.md` §19.5, ADR-0053):
 * his own open tickets and the detail of one of them.
 *
 * The page lies outside the shell of the app — a customer never sees the menu
 * of the office and never sees the data of another customer.
 */

interface TicketListAnswer {
  tickets: CustomerTicketSummary[]
}

type TicketDetailAnswer = CustomerTicketDetail

interface ObjectListAnswer {
  objects: CustomerObject[]
}

function formatDate(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale)
}

export function PortalTicketsPage() {
  const { t, i18n } = useTranslation('customer')

  const ticketsQuery = useQuery({
    queryKey: ['customer', 'tickets'],
    queryFn: () => apiFetch<TicketListAnswer>('/v1/customer/tickets'),
    retry: false,
  })

  const objectsQuery = useQuery({
    queryKey: ['customer', 'objects'],
    queryFn: () => apiFetch<ObjectListAnswer>('/v1/customer/objects'),
    retry: false,
  })

  const tickets = ticketsQuery.data?.tickets ?? []
  const objects = objectsQuery.data?.objects ?? []

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('portal.title')}</h1>
        <p className="text-sm text-slate-600">{t('portal.hint')}</p>
        <p className="text-xs text-slate-500">{t('portal.addressHint')}</p>
      </div>

      {ticketsQuery.isError ? (
        <p className="text-sm text-red-700" role="alert">
          {t('auth.errors.internal_error')}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        {ticketsQuery.isPending ? <p className="text-sm">{t('portal.loading')}</p> : null}

        {tickets.map((ticket) => (
          <Link
            key={ticket.ticketNo}
            to={`/portal/tickets/${ticket.ticketNo}`}
            className="flex flex-col gap-1 rounded border border-slate-200 p-3"
          >
            <span className="text-sm font-medium">
              {`${ticket.ticketNo} — ${ticket.objectName}`}
            </span>
            <span className="text-xs text-slate-600">
              {`${ticket.status} · ${formatDate(ticket.reportedAt, i18n.language)}`}
            </span>
          </Link>
        ))}

        {!ticketsQuery.isPending && tickets.length === 0 ? (
          <p className="text-sm text-slate-600">{t('portal.empty')}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('portal.objects')}</h2>
        {objects.map((object) => (
          <span key={object.objectNo} className="text-sm text-slate-700">
            {`${object.objectNo} — ${object.name}`}
          </span>
        ))}
      </section>
    </main>
  )
}

export function PortalTicketPage() {
  const { t, i18n } = useTranslation('customer')
  const { ticketNo } = useParams()
  const queryClient = useQueryClient()

  const ticketQuery = useQuery({
    queryKey: ['customer', 'ticket', ticketNo],
    queryFn: () => apiFetch<TicketDetailAnswer>(`/v1/customer/tickets/${ticketNo ?? ''}`),
    enabled: ticketNo !== undefined,
    retry: false,
  })

  const ticket = ticketQuery.data

  // §19.6: the customer decides himself about the messages about his ticket.
  const notifications = useMutation({
    mutationFn: (emailNotifications: boolean) =>
      apiFetch<unknown>(`/v1/customer/tickets/${ticketNo ?? ''}/notifications`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailNotifications }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer', 'ticket', ticketNo] })
      void queryClient.invalidateQueries({ queryKey: ['customer', 'tickets'] })
    },
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <Link to="/portal/tickets" className="text-sm text-slate-600">
        {t('portal.ticket.back')}
      </Link>

      {ticketQuery.isError ? (
        <p className="text-sm text-red-700" role="alert">
          {t('auth.errors.internal_error')}
        </p>
      ) : null}

      {ticket !== undefined ? (
        <>
          <h1 className="text-xl font-semibold">{`${ticket.ticketNo} — ${ticket.objectName}`}</h1>

          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-600">{t('portal.ticket.status')}</dt>
              <dd>{ticket.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-600">{t('portal.ticket.priority')}</dt>
              <dd>{ticket.priority}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-600">{t('portal.ticket.reportedAt')}</dt>
              <dd>{formatDate(ticket.reportedAt, i18n.language)}</dd>
            </div>
          </dl>

          {ticket.description !== null ? <p className="text-sm">{ticket.description}</p> : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ticket.emailNotifications}
              disabled={notifications.isPending}
              onChange={(event) => notifications.mutate(event.target.checked)}
            />
            <span>{t('portal.ticket.emailNotifications')}</span>
          </label>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t('portal.ticket.history')}</h2>
            {ticket.events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-600">
                  {formatDate(event.at, i18n.language)}
                </span>
                <span className="text-sm">{event.text}</span>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </main>
  )
}
