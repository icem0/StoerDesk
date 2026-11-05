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
 * Ticket detail page (`PLAN.md` §14, WP-M2-18b / WP-M2-19d / WP-M4-07).
 *
 * Layout per user request:
 * - Header: ticket number + object on the left, status + priority badges on the top right.
 * - Timeline bar directly under the header: "Gemeldet am" left, "Reaktionszeit bis" right,
 *   6 h scale markings below the bar, milestone dots on the bar.
 * - Object row: object name + object number side by side, labels above.
 * - Three fields side by side: Erfasser, Meldender, Quelle with labels above.
 * - Description, photos, history follow below.
 * - All workflow actions live in a single dropdown menu; "Zurück zur Liste" is a menu entry.
 * - The standalone "Zurück zur Liste" button is removed.
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
      setSelectedAction(null)
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

  /**
   * Builds the list of dropdown menu entries for the current status.
   * Each entry: { value, labelKey, needsConfirm, confirmLabelKey, abortLabelKey, fieldRenderer? }
   */
  const status = ticket.status
  const req = (name: string) => (fields[name] ?? '').trim()

  const menuEntries: { value: string; labelKey: string }[] = []

  if (status === 'NEW') {
    menuEntries.push({ value: 'review_started', labelKey: 'detail.action.review' })
  } else if (status === 'IN_REVIEW') {
    menuEntries.push({ value: 'work_order_set', labelKey: 'detail.action.workOrder' })
  } else if (status === 'WORK_ORDER_CREATED') {
    menuEntries.push({ value: 'assigned', labelKey: 'detail.action.assign' })
    menuEntries.push({ value: 'offered', labelKey: 'detail.action.offer' })
  } else if (status === 'OFFERED' || status === 'ASSIGNED') {
    menuEntries.push({ value: 'accepted', labelKey: 'detail.action.accept' })
    menuEntries.push({ value: 'declined', labelKey: 'detail.action.decline' })
  } else if (status === 'ACCEPTED') {
    menuEntries.push({ value: 'acknowledged', labelKey: 'detail.action.acknowledge' })
  } else if (status === 'ACKNOWLEDGED') {
    menuEntries.push({ value: 'closed', labelKey: 'detail.action.close' })
  } else if (status === 'CLOSED') {
    menuEntries.push({ value: 'reopened', labelKey: 'detail.action.reopen' })
  }

  if (status !== 'CLOSED' && status !== 'CANCELLED') {
    menuEntries.push({ value: 'commented', labelKey: 'detail.action.comment' })
  }

  if (status !== 'CANCELLED') {
    menuEntries.push({ value: 'cancel', labelKey: 'detail.menu.cancel' })
  }
  if (status === 'CANCELLED') {
    menuEntries.push({ value: 'uncancel', labelKey: 'detail.menu.uncancel' })
    if (mayDelete) {
      menuEntries.push({ value: 'delete', labelKey: 'detail.menu.delete' })
    }
  }

  // "Zurück zur Liste" replaces the removed standalone button.
  menuEntries.push({ value: 'list', labelKey: 'detail.back' })

  function renderConfirmPanel(): ReactNode {
    switch (selectedAction) {
      case 'work_order_set': {
        const type = req('workOrderType')
        const number = req('workOrderNumber')
        const missing = type === '' || number === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.workOrderType')}
              value={fields.workOrderType ?? ''}
              onChange={(event) => setFields({ ...fields, workOrderType: event.target.value })}
            />
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.workOrderNumber')}
              value={fields.workOrderNumber ?? ''}
              onChange={(event) => setFields({ ...fields, workOrderNumber: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                void handleAction('work_order_set', {
                  type: req('workOrderType'),
                  number: req('workOrderNumber'),
                })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'declined': {
        const reason = req('declineReason')
        const missing = reason === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.declineReason')}
              value={fields.declineReason ?? ''}
              onChange={(event) => setFields({ ...fields, declineReason: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('declined', { reason: req('declineReason') })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'acknowledged': {
        const result = req('acknowledgeResult')
        const missing = result === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.acknowledgeResult')}
              value={fields.acknowledgeResult ?? ''}
              onChange={(event) => setFields({ ...fields, acknowledgeResult: event.target.value })}
            />
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.acknowledgeNote')}
              value={fields.acknowledgeNote ?? ''}
              onChange={(event) => setFields({ ...fields, acknowledgeNote: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('acknowledged', {
                  result: req('acknowledgeResult'),
                  note: req('acknowledgeNote'),
                })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'reopened': {
        const reason = req('reopenReason')
        const missing = reason === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.reopenReason')}
              value={fields.reopenReason ?? ''}
              onChange={(event) => setFields({ ...fields, reopenReason: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('reopened', { reason: req('reopenReason') })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'commented': {
        const text = req('commentText')
        const missing = text === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.commentText')}
              value={fields.commentText ?? ''}
              onChange={(event) => setFields({ ...fields, commentText: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('commented', { text: req('commentText') })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'cancel': {
        const reason = req('cancelReason')
        const missing = reason === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.cancelReason')}
              value={fields.cancelReason ?? ''}
              onChange={(event) => setFields({ ...fields, cancelReason: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('cancelled', { reason: req('cancelReason') })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'uncancel': {
        const reason = req('uncancelReason')
        const missing = reason === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.uncancelReason')}
              value={fields.uncancelReason ?? ''}
              onChange={(event) => setFields({ ...fields, uncancelReason: event.target.value })}
            />
            <button
              className={`min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 ${missing ? 'disabled' : ''}`}
              type="button"
              disabled={missing}
              onClick={() => {
                if (missing) {
                  setLastError(t('detail.errors.fieldRequired'))
                  return
                }
                setSelectedAction(null)
                void handleAction('uncancelled', { reason: req('uncancelReason') })
              }}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'delete': {
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <span className="text-xs text-rose-300">{t('detail.prompt.deleteConfirm')}</span>
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              placeholder={t('detail.prompt.deleteConfirmNumber')}
              value={fields.deleteConfirm ?? ''}
              onChange={(event) => setFields({ ...fields, deleteConfirm: event.target.value })}
            />
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-rose-600 hover:bg-rose-500"
              type="button"
              onClick={() => void handleDelete(req('deleteConfirm'))}
            >
              {t('detail.action.confirm')}
            </button>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                setFields({})
                setLastError(null)
              }}
            >
              {t('detail.action.abort')}
            </button>
          </div>
        )
      }
      case 'list':
        navigate('/tickets')
        setSelectedAction(null)
        return null
      default:
        return null
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Header: title left, status + priority right */}
      <div className="flex flex-col sm:flex-row sm:items-between sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {t('detail.title', { ticketNo: ticket.ticketNo })}
          </h1>
          <p className="text-sm text-slate-400">{t('detail.subtitle', { object: ticket.objectName })}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <span
            data-testid="ticket-status-badge"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
          >
            {t(`status.values.${ticket.status}`) ?? ticket.status}
          </span>
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-900/30 text-slate-300">
            {t(`priority.${ticket.priority}`) ?? ticket.priority}
          </span>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="col-span-full rounded bg-amber-900/20 border border-amber-500/30 p-3 text-sm">
          {t('detail.offlineQueued', { count: pendingCount })}
        </div>
      )}

      {/* Timeline on top */}
      <TicketTimeline
        reportedAt={timelineData.reportedAt}
        deadlineAt={timelineData.deadlineAt}
        stoppedAt={timelineData.stoppedAt}
        pauses={ticketQuery.data!.pauses}
        markers={timelineData.markers}
        status={ticket.status}
        onPause={handlePause}
        onResume={handleResume}
        deadlineHours={Math.max(1, Math.round(timelineData.totalMs / 3_600_000))}
        scaleSuffix={t('timeline.scaleSuffix')}
      />

      {/* Object: name + number side by side, labels above */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.object')}
          </label>
          <span className="text-sm text-slate-200">{ticket.objectName}</span>
        </div>
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.objectNo')}
          </label>
          <span className="text-sm font-mono text-slate-300">{ticket.objectNo}</span>
        </div>
      </div>

      {/* Three fields side by side: Erfasser, Meldender, Quelle */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.recordedBy')}
          </label>
          <span className="text-sm text-slate-200">{ticket.reporterName ?? t('detail.field.unknown')}</span>
        </div>
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.reportedBy')}
          </label>
          <span className="text-sm text-slate-200">
            {ticket.reporterPhone ?? ticket.reporterEmail ?? t('detail.field.unknown')}
          </span>
        </div>
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.source')}
          </label>
          <span className="text-sm text-slate-200">{ticket.source}</span>
        </div>
      </div>

      {/* Title */}
      {ticket.title !== null && (
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.title')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{ticket.title}</p>
        </div>
      )}

      {/* Description */}
      {ticket.description !== null && (
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.description')}
          </label>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Faults */}
      {ticket.faultTemplateKeys.length > 0 && (
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            {t('detail.field.faults')}
          </label>
          <div className="flex flex-wrap gap-2">
            {ticket.faultTemplateKeys.map((key) => (
              <span key={key} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
                {labels[key] ?? key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            {t('detail.photos.title')}
          </label>
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

      {/* History / Verlauf */}
      <div className="col-span-full">
        <label className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          {t('detail.history')}
        </label>
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

      {/* Actions dropdown */}
      <div className="col-span-full">
        <label className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          {t('detail.actions')}
        </label>
        <select
          value={selectedAction ?? ''}
          onChange={(event) => {
            const value = event.target.value
            setSelectedAction(value === '' ? null : value)
            setLastError(null)
          }}
          className="w-full min-w-[200px] rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
        >
          <option value="">{t('detail.action.choose')}</option>
          {menuEntries.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {t(entry.labelKey)}
            </option>
          ))}
        </select>
        {selectedAction !== null && selectedAction !== 'list' && (
          <div className="mt-2">{renderConfirmPanel()}</div>
        )}
      </div>

      {lastError !== null && (
        <p className="text-rose-400 text-sm" role="alert">{lastError}</p>
      )}

      <OfflineActionBanner rows={rows} onRetry={deliverNow} onDiscard={discard} />
    </section>
  )
}
