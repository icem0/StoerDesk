import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiFetch, ApiError } from '../../lib/api'
import { i18n } from '../../i18n'
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
 * timeline, and the photo list. The always visible action panel (WP-M2-91) sits below
 * the title, stays reachable at the bottom on mobile and takes inline input fields for
 * payload actions; failures show as an inline alert line — no `window` dialogs.
 */

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

function useTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail', ticketNo],
    queryFn: () => apiFetch<TicketDetailResponse>(`/v1/tickets/${ticketNo ?? ''}`),
    enabled: ticketNo !== undefined,
    retry: false,
  })
}

function formatTime(iso: string): string {
  const locale = i18n.language === 'en' ? 'en-US' : 'de-DE'
  return new Date(iso).toLocaleString(locale)
}

function formatEventTime(iso: string): string {
  const locale = i18n.language === 'en' ? 'en-US' : 'de-DE'
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
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
  uncancelled: 'uncancel',
}

export function TicketDetailPage() {
  const { t, i18n } = useTranslation('ticket')
  const navigate = useNavigate()
  const { ticketNo } = useParams()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [lastError, setLastError] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)

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
      setLastError(null)
      setFields({})
    } catch (error) {
      if (error instanceof ApiError) {
        setLastError(error.code ?? t('detail.errors.actionFailed'))
        return
      }
      // Network error (no ApiError): queue the write offline and show the
      // queued notice instead of an error (WP-M5-05).
      const actionKind = (segment === 'comments'
        ? 'comment'
        : segment) as 'acknowledge' | 'comment' | 'decline'
      await queueAction(actionKind, body ?? {})
    }
  }

  async function handleDelete(confirmed: string) {
    if (ticketNo === undefined) return

    if (confirmed !== ticketNo) {
      setLastError(t('detail.errors.deleteConfirmMismatch'))
      return
    }

    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}`, { method: 'DELETE' })
      navigate('/tickets')
    } catch (error) {
      const err = error as { status?: number; code?: string; params?: Record<string, string | number> }
      setLastError(err.code ?? t('detail.errors.deleteFailed'))
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
        setLastError(error.code ?? t('detail.errors.actionFailed'))
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
        setLastError(error.code ?? t('detail.errors.actionFailed'))
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
          </div>
      </div>

      {pendingCount > 0 && (
        <div className="col-span-full rounded bg-amber-900/20 border border-amber-500/30 p-3 text-sm">
          {t('detail.offlineQueued', { count: pendingCount })}
        </div>
      )}

      <div
        data-testid="ticket-actions"
        className="col-span-full flex flex-col gap-2 sticky bottom-4 z-10 rounded bg-slate-900/95 border border-slate-700 p-3"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('detail.actions')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const status = ticket.status
            const req = (name: string) => (fields[name] ?? '').trim()

            const btn = (labelKey: string, onClick: () => void, color: string, hover: string) => (
              <button
                key={labelKey}
                className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-${color} hover:bg-${hover}`}
                type="button"
                onClick={onClick}
              >
                {t(`detail.action.${labelKey}`)}
              </button>
            )

            const field = (name: string, promptKey: string) => (
              <input
                key={name}
                className="w-full box-border rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 min-h-11"
                name={name}
                placeholder={t(promptKey)}
                type="text"
                value={fields[name] ?? ''}
                onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
              />
            )

            const actions: ReactNode[] = []

            if (status === 'NEW') {
              actions.push(btn('review', () => void handleAction('review_started'), 'slate-600', 'slate-500'))
            } else if (status === 'IN_REVIEW') {
              actions.push(
                field('workOrderType', 'detail.prompt.workOrderType'),
                field('workOrderNumber', 'detail.prompt.workOrderNumber'),
                btn('workOrder', () => {
                  const type = req('workOrderType')
                  const number = req('workOrderNumber')
                  if (type === '' || number === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  void handleAction('work_order_set', { type, number })
                }, 'sky-600', 'sky-500'),
              )
            } else if (status === 'WORK_ORDER_CREATED') {
              actions.push(
                btn('assign', () => void handleAction('assigned'), 'slate-600', 'slate-500'),
                btn('offer', () => void handleAction('offered'), 'purple-600', 'purple-500'),
              )
            } else if (status === 'OFFERED' || status === 'ASSIGNED') {
              actions.push(
                btn('accept', () => void handleAction('accepted'), 'emerald-600', 'emerald-500'),
                btn('decline', () => {
                  const reason = req('declineReason')
                  if (reason === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  void handleAction('declined', { reason })
                }, 'rose-600', 'rose-500'),
              )
            } else if (status === 'ACCEPTED') {
              actions.push(
                field('acknowledgeResult', 'detail.prompt.acknowledgeResult'),
                field('acknowledgeNote', 'detail.prompt.acknowledgeNote'),
                btn('acknowledge', () => {
                  const result = req('acknowledgeResult')
                  if (result === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  void handleAction('acknowledged', {
                    result,
                    note: req('acknowledgeNote'),
                  })
                }, 'emerald-600', 'emerald-500'),
              )
            } else if (status === 'ACKNOWLEDGED') {
              actions.push(btn('close', () => void handleAction('closed'), 'slate-600', 'slate-500'))
            } else if (status === 'CLOSED') {
              actions.push(
                btn('reopen', () => {
                  const reason = req('reopenReason')
                  if (reason === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  void handleAction('reopened', { reason })
                }, 'rose-600', 'rose-500'),
              )
            }

            if (status !== 'CLOSED' && status !== 'CANCELLED') {
              actions.push(
                field('commentText', 'detail.prompt.commentText'),
                btn('comment', () => {
                  const text = req('commentText')
                  if (text === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  void handleAction('commented', { text })
                }, 'slate-600', 'slate-500'),
              )
            }

            // One openable menu instead of permanently visible input fields
            // that block the view. Confirmation fields appear only after a
            // menu entry is chosen.
            if (status !== 'CLOSED') {
              actions.push(
                <select
                  key="cancel-menu"
                  value={selectedAction ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setSelectedAction(value === '' ? null : value)
                    setLastError(null)
                  }}
                  className="w-full min-w-[150px] rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
                >
                  <option value="">{t('detail.action.choose')}</option>
                  {status !== 'CANCELLED' && (
                    <option value="cancel">{t('detail.menu.cancel')}</option>
                  )}
                  {status === 'CANCELLED' && (
                    <option value="uncancel">{t('detail.menu.uncancel')}</option>
                  )}
                  {status === 'CANCELLED' && mayDelete && (
                    <option value="delete">{t('detail.menu.delete')}</option>
                  )}
                </select>,
              )
            }

            if (selectedAction === 'cancel') {
              actions.push(
                field('cancelReason', 'detail.prompt.cancelReason'),
                btn('confirm', () => {
                  const reason = req('cancelReason')
                  if (reason === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  setSelectedAction(null)
                  void handleAction('cancelled', { reason })
                }, 'rose-600', 'rose-500'),
                btn('abort', () => {
                  setSelectedAction(null)
                  setFields({})
                }, 'slate-600', 'slate-500'),
              )
            }

            if (selectedAction === 'uncancel') {
              actions.push(
                field('uncancelReason', 'detail.prompt.uncancelReason'),
                btn('confirm', () => {
                  const reason = req('uncancelReason')
                  if (reason === '') {
                    setLastError(t('detail.errors.fieldRequired'))
                    return
                  }
                  setSelectedAction(null)
                  void handleAction('uncancelled', { reason })
                }, 'rose-600', 'rose-500'),
                btn('abort', () => {
                  setSelectedAction(null)
                  setFields({})
                }, 'slate-600', 'slate-500'),
              )
            }

            if (selectedAction === 'delete') {
              actions.push(
                <span key="delete-warning" className="text-xs text-rose-300">
                  {t('detail.prompt.deleteConfirm')}
                </span>,
                field('deleteConfirm', 'detail.prompt.deleteConfirmNumber'),
                btn('confirm', () => void handleDelete(req('deleteConfirm')), 'rose-600', 'rose-500'),
                btn('abort', () => {
                  setSelectedAction(null)
                  setFields({})
                }, 'slate-600', 'slate-500'),
              )
            }

            return actions
          })()}
        </div>
        {lastError !== null && (
          <p className="text-rose-400 text-sm" role="alert">
            {lastError}
          </p>
        )}
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
                  data-testid="ticket-status-badge"
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
                >
                  {t(`status.values.${ticket.status}`) ?? ticket.status}
                </span>
              </dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-500">{t('detail.field.priority')}</dt>
              <dd className="text-sm">
                <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-slate-900/30 text-slate-300">
                  {t(`priority.${ticket.priority}`) ?? ticket.priority}
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

        <div className="col-span-full">
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
        </div>

      <div className="col-span-full">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {t('detail.history')}
        </h2>
        <div data-testid="ticket-history" className="border border-slate-700 rounded divide-y divide-slate-700">
          {events.length === 0 ? (
            <p className="p-3 text-slate-400">{t('detail.historyEmpty')}</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="p-3 flex gap-3">
                <div className="w-24 shrink-0 whitespace-nowrap">
                  <span className="text-xs font-mono text-slate-500">
                    {formatEventTime(event.createdAt)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">
                    {t(`status.events.${event.type}`) ?? event.type}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t(`actorKind.${event.actorKind}`) ?? event.actorKind}
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
    </section>
  )
}
