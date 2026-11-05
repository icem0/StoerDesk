import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiFetch, ApiError } from '../../lib/api'
import { usePermission } from '../../auth/usePermission'
import { useFaultCatalog } from './use-fault-catalog'
import { useInternalActions } from './use-internal-actions'
import { OfflineActionBanner } from './offline-action-banner'
import { TicketTimeline } from './ticket-timeline'

/**
 * Ticket detail page (`PLAN.md` §14, WP-M2-18b / WP-M2-19d).
 *
 * Loads `GET /api/v1/tickets/:ticketNo` and renders the ticket header (number,
 * object, status badge, priority badge, times), the append-only event history as a
 * timeline, and the photo list. Action buttons (review, assign, accept,
 * acknowledge, close) call the matching POST endpoint of WP-M2-19c and refetch
 * the ticket on success.
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

/**
 * Workflow events are not URL segments (`WP-M2-19c`): the detail page maps each
 * event to the route path of `apps/api/src/tickets/workflow-routes.ts`.
 */
const ACTION_SEGMENTS: Record<string, string> = {
  review_started: 'review',
  work_order_set: 'work-order',
  assigned: 'assign',
  offered: 'offer',
  claimed: 'claim',
  accepted: 'accept',
  declined: 'decline',
  acknowledged: 'acknowledge',
  commented: 'comments',
  closed: 'close',
  reopened: 'reopen',
  cancelled: 'cancel',
}

export function TicketDetailPage() {
  const { t, i18n } = useTranslation('ticket')
  const navigate = useNavigate()
  const { ticketNo } = useParams()
  const [showActions, setShowActions] = useState(false)

  const ticketQuery = useTicket(ticketNo)
  const mayDelete = usePermission('ticket.delete')
  const { queueAction, deliverNow, discard, pendingCount, rows } = useInternalActions(ticketNo ?? '')

  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)
  const labels = Object.fromEntries(catalog.map((entry) => [entry.key, entry.text]))

  async function handleAction(event: string, body?: Record<string, unknown>) {
    if (ticketNo === undefined) return

    const segment = ACTION_SEGMENTS[event]

    if (segment === undefined) return

    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}/${segment}`, {
        method: 'POST',
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      })
      void ticketQuery.refetch()
      setShowActions(false)
    } catch (error) {
      if (error instanceof ApiError) {
        alert(error.code ?? t('detail.errors.actionFailed'))
        return
      }
      // Network error (no ApiError): queue the write offline and show the
      // queued notice instead of an error (WP-M5-05).
      const actionKind = (segment === 'comments'
        ? 'comment'
        : segment) as 'acknowledge' | 'comment' | 'decline'
      await queueAction(actionKind, body ?? {})
      setShowActions(false)
    }
  }

  async function handleDelete() {
    if (ticketNo === undefined) return

    if (!window.confirm(t('detail.prompt.deleteConfirm'))) {
      return
    }

    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}`, { method: 'DELETE' })
      navigate('/tickets')
    } catch (error) {
      const err = error as { status?: number; code?: string; params?: Record<string, string | number> }
      alert(err.code ?? t('detail.errors.deleteFailed'))
    }
  }

  async function handlePause(reason: string) {
    if (ticketNo === undefined) return
    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      void ticketQuery.refetch()
    } catch (error) {
      if (error instanceof ApiError) {
        alert(error.code ?? t('detail.errors.actionFailed'))
      }
    }
  }

  async function handleResume() {
    if (ticketNo === undefined) return
    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}/resume`, { method: 'POST' })
      void ticketQuery.refetch()
    } catch (error) {
      if (error instanceof ApiError) {
        alert(error.code ?? t('detail.errors.actionFailed'))
      }
    }
  }

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

  const timelineData = ticketQuery.data!.timeline

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

      {pendingCount > 0 && (
        <div className="col-span-full rounded bg-amber-900/20 border border-amber-500/30 p-3 text-sm">
          {t('detail.offlineQueued', { count: pendingCount })}
        </div>
      )}

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
                <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-slate-900/30 text-slate-300">
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
                  {labels[key] ?? key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <TicketTimeline
        reportedAt={timelineData.reportedAt}
        deadlineAt={timelineData.deadlineAt}
        stoppedAt={timelineData.stoppedAt}
        pauses={ticketQuery.data!.pauses}
        markers={timelineData.markers}
        status={ticket.status}
        onPause={handlePause}
        onResume={handleResume}
      />

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
                  <div className="text-sm font-medium text-slate-200">{event.type}</div>
                  <div className="text-xs text-slate-400">
                    {event.actorKind}
                    {event.actorName !== null ? ` (${event.actorName})` : ''}
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

      <OfflineActionBanner rows={rows} onRetry={deliverNow} onDiscard={discard} />

      {showActions && (
        <div className="col-span-full flex flex-wrap gap-2">
          {(() => {
            const status = ticket.status

            const actionBtn = (labelKey: string, event: string, color = 'slate-700') => (
              <button
                key={event}
                className={`rounded bg-${color} px-4 py-2 text-sm text-slate-200 hover:bg-${color === 'slate-700' ? 'slate-600' : color === 'sky-600' ? 'sky-500' : 'rose-600'}`}
                type="button"
                onClick={() => void handleAction(event)}
              >
                {t(`detail.action.${labelKey}`)}
              </button>
            )

            const buttons = []

            if (status === 'NEW') {
              buttons.push(actionBtn('review', 'review_started'))
            } else if (status === 'IN_REVIEW') {
              buttons.push(
                <button
                  key="work_order"
                  className="rounded bg-sky-600 px-4 py-2 text-sm text-slate-200 hover:bg-sky-500"
                  type="button"
                  onClick={() => {
                    const type = window.prompt(t('detail.prompt.workOrderType'))
                    const number = window.prompt(t('detail.prompt.workOrderNumber'))
                    if (type !== null && number !== null) {
                      void handleAction('work_order_set', { type: type.trim(), number: number.trim() })
                    }
                  }}
                >
                  {t('detail.action.workOrder')}
                </button>
              )
            } else if (status === 'WORK_ORDER_CREATED') {
              buttons.push(actionBtn('assign', 'assigned'))
              buttons.push(actionBtn('offer', 'offered', 'purple-600'))
            } else if (status === 'OFFERED' || status === 'ASSIGNED') {
              buttons.push(actionBtn('accept', 'accepted', 'emerald-600'))
              buttons.push(
                <button
                  key="decline"
                  className="rounded bg-rose-600 px-4 py-2 text-sm text-slate-200 hover:bg-rose-500"
                  type="button"
                  onClick={() => {
                    const reason = window.prompt(t('detail.prompt.declineReason'))
                    if (reason !== null && reason.trim() !== '') {
                      void handleAction('declined', { reason: reason.trim() })
                    }
                  }}
                >
                  {t('detail.action.decline')}
                </button>
              )
            } else if (status === 'ACCEPTED') {
              buttons.push(
                <button
                  key="acknowledge"
                  className="rounded bg-emerald-600 px-4 py-2 text-sm text-slate-200 hover:bg-emerald-500"
                  type="button"
                  onClick={() => {
                    const result = window.prompt(t('detail.prompt.acknowledgeResult'))
                    if (result === null) return
                    const note = window.prompt(t('detail.prompt.acknowledgeNote')) ?? ''
                    void handleAction('acknowledged', {
                      result: result.trim(),
                      note: note.trim(),
                    })
                  }}
                >
                  {t('detail.action.acknowledge')}
                </button>
              )
            } else if (status === 'ACKNOWLEDGED') {
              buttons.push(actionBtn('close', 'closed'))
            } else if (status === 'CLOSED') {
              buttons.push(
                <button
                  key="reopen"
                  className="rounded bg-rose-600 px-4 py-2 text-sm text-slate-200 hover:bg-rose-500"
                  type="button"
                  onClick={() => {
                    const reason = window.prompt(t('detail.prompt.reopenReason'))
                    if (reason !== null && reason.trim() !== '') {
                      void handleAction('reopened', { reason: reason.trim() })
                    }
                  }}
                >
                  {t('detail.action.reopen')}
                </button>
              )
            }

            if (status !== 'CLOSED' && status !== 'CANCELLED') {
              buttons.push(
                <button
                  key="comment"
                  className="rounded bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500"
                  type="button"
                  onClick={() => {
                    const text = window.prompt(t('detail.prompt.commentText'))
                    if (text !== null && text.trim() !== '') {
                      void handleAction('commented', { text: text.trim() })
                    }
                  }}
                >
                  {t('detail.action.comment')}
                </button>
              )
            }

            buttons.push(
              <button
                key="cancel"
                className="rounded bg-rose-600 px-4 py-2 text-sm text-slate-200 hover:bg-rose-500"
                type="button"
                onClick={() => {
                  const reason = window.prompt(t('detail.prompt.cancelReason'))
                  if (reason !== null && reason.trim() !== '') {
                    void handleAction('cancelled', { reason: reason.trim() })
                  }
                }}
                >
                  {t('detail.action.cancel')}
                </button>
            )

            if (status === 'CANCELLED' && mayDelete) {
              buttons.push(
                <button
                  key="delete"
                  className="rounded bg-rose-600 px-4 py-2 text-sm text-slate-200 hover:bg-rose-500"
                  type="button"
                  onClick={handleDelete}
                >
                  {t('detail.action.delete')}
                </button>
              )
            }

            return buttons
          })()}
        </div>
      )}
    </section>
  )
}
