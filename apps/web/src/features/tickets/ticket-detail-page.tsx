import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TicketDetailResponse } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Ticket detail page (`PLAN.md` §14, WP-M2-18b).
 *
 * Loads `GET /api/v1/tickets/:ticketNo` and renders the ticket header (number,
 * object, status badge, priority badge, times), the append-only event history as a
 * timeline, and the photo list. Action buttons (review, assign, accept,
 * acknowledge, close) are disabled placeholders until phase 4 (transitionTicket,
 * WP-M2-19).
 */

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Neu',
  IN_REVIEW: 'In Prüfung',
  WORK_ORDER_CREATED: 'Auftrag angelegt',
  OFFERED: 'Angeboten',
  ASSIGNED: 'Zugewiesen',
  ACCEPTED: 'Angenommen',
  ACKNOWLEDGED: 'Rückmeldung erfolgt',
  CLOSED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
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

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  critical: 'Kritisch',
}

function useTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail', ticketNo],
    queryFn: () => apiFetch<TicketDetailResponse>(`/v1/tickets/${ticketNo ?? ''}`),
    enabled: ticketNo !== undefined,
    retry: false,
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE')
}

export function TicketDetailPage() {
  const { t } = useTranslation('ticket')
  const navigate = useNavigate()
  const { ticketNo } = useParams()
  const [showActions, setShowActions] = useState(false)

  const ticketQuery = useTicket(ticketNo)

  if (ticketQuery.isPending) {
    return <p className="text-slate-400">{t('detail.loading')}</p>
  }

  if (ticketQuery.isError) {
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  const ticket = ticketQuery.data?.ticket
  const events = ticketQuery.data?.events ?? []
  const photos = ticketQuery.data?.photos ?? []

  if (ticket === undefined) {
    return <p className="text-rose-400 text-sm" role="alert">{t('detail.errors.notFound')}</p>
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-between sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {t('detail.title', { ticketNo: ticket.ticketNo })}
          </h1>
          <p className="text-sm text-slate-400">{t('detail.subtitle', { object: ticket.objectName })}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
            type="button"
            onClick={() => navigate('/tickets')}
          >
            {t('detail.back')}
          </button>
          <button
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            type="button"
            onClick={() => setShowActions(!showActions)}
          >
            {t('detail.actions')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-full">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {t('detail.header')}
          </h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.object')}</dt>
              <dd className="text-sm text-slate-200">{ticket.objectName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('detail.field.objectNo')}</dt>
              <dd className="text-sm font-mono text-slate-300">{ticket.objectNo}</dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.status')}</dt>
              <dd className="text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
                >
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.priority')}</dt>
              <dd className="text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${'bg-slate-900/30 text-slate-300'}`}
                >
                  {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                </span>
              </dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.source')}</dt>
              <dd className="text-sm text-slate-200">{ticket.source}</dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.reportedAt')}</dt>
              <dd className="text-sm text-slate-200">{formatTime(ticket.reportedAt)}</dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.deadlineAt')}</dt>
              <dd className="text-sm text-slate-200">{formatTime(ticket.deadlineAt)}</dd>
            </div>
            {ticket.reporterName !== null && (
              <div className="col-span-full">
                <dt className="text-xs text-slate-500">{t('detail.field.reporterName')}</dt>
                <dd className="text-sm text-slate-200">{ticket.reporterName}</dd>
              </div>
            )}
            {ticket.reporterPhone !== null && (
              <div className="col-span-full">
                <dt className="text-xs text-slate-500">{t('detail.field.reporterPhone')}</dt>
                <dd className="text-sm text-slate-200">{ticket.reporterPhone}</dd>
              </div>
            )}
            {ticket.reporterEmail !== null && (
              <div className="col-span-full">
                <dt className="text-xs text-slate-500">{t('detail.field.reporterEmail')}</dt>
                <dd className="text-sm text-slate-200">{ticket.reporterEmail}</dd>
              </div>
            )}
          </dl>
        </div>

        {ticket.title !== null && (
          <div className="col-span-full">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('detail.field.title')}
            </h2>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{ticket.title}</p>
          </div>
        )}

        {ticket.description !== null && (
          <div className="col-span-full">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('detail.field.description')}
            </h2>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}

        {ticket.faultTemplateKeys.length > 0 && (
          <div className="col-span-full">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('detail.field.faults')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {ticket.faultTemplateKeys.map((key) => (
                <span key={key} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                  {key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="col-span-full">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {t('detail.history')}
        </h2>
        <div className="border border-slate-700 rounded divide-y divide-slate-700">
          {events.length === 0 ? (
            <p className="p-3 text-slate-400">{t('detail.historyEmpty')}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="p-3 flex gap-3">
                <div className="w-8">
                  <span className="text-xs font-mono text-slate-500">
                    {formatTime(event.createdAt).substring(11)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">
                    {event.type}
                  </div>
                  <div className="text-xs text-slate-400">
                    {event.actorKind}{' '}
                    {event.actorName !== null ? `(${event.actorName})` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="col-span-full">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {t('detail.photos.title')}
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="text-xs text-slate-400">
                <div className="truncate">{photo.filePath}</div>
                <div className="text-slate-500">
                  {photo.mimeType} · {t('detail.photos.sizeKB', { size: (photo.sizeBytes / 1024).toFixed(1) })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showActions && (
        <div className="col-span-full flex gap-2">
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
            disabled
            type="button"
          >
            {t('detail.action.review')}
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
            disabled
            type="button"
          >
            {t('detail.action.assign')}
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
            disabled
            type="button"
          >
            {t('detail.action.accept')}
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
            disabled
            type="button"
          >
            {t('detail.action.acknowledge')}
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
            disabled
            type="button"
          >
            {t('detail.action.close')}
          </button>
        </div>
      )}
    </section>
  )
}
