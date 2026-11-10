import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TicketDetailResponse } from '@stoerdesk/shared'
import { type StandardTextLocale } from '@stoerdesk/shared'

import { apiBaseUrl, apiFetch, ApiError } from '../../lib/api'
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
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ id: string; url: string } | null>(null)
  const [stornoOpen, setStornoOpen] = useState(false)
  const [stornoReason, setStornoReason] = useState('')
  const [stornoMode, setStornoMode] = useState<'cancel' | 'uncancel'>('cancel')
  const optionsMenuRef = useRef<HTMLDivElement>(null)
  const optionsButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (notice === null) {
      return
    }
    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!optionsOpen) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      if (
        !optionsMenuRef.current?.contains(event.target as Node) &&
        !optionsButtonRef.current?.contains(event.target as Node)
      ) {
        setOptionsOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOptionsOpen(false)
        optionsButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [optionsOpen])

  const ticketQuery = useTicket(ticketNo)
  const mayDelete = usePermission('ticket.delete')
  const { queueAction, deliverNow, discard, pendingCount, rows } = useInternalActions(ticketNo ?? '')

  const locale = (i18n.language === 'en' ? 'en' : 'de') as StandardTextLocale
  const catalog = useFaultCatalog(locale)
  const labels = Object.fromEntries(catalog.map((entry) => [entry.key, entry.text]))

  async function handleAction(event: string, body?: Record<string, unknown>): Promise<boolean> {
    if (ticketNo === undefined) return false

    const segment = ACTION_SEGMENTS[event]

    if (segment === undefined) return false

    // The comment route requires an idempotency key; the outbox replay sends the
    // same shape (`outbox.ts`), so both paths share one receipt per write.
    const payload =
      segment === 'comments'
        ? { ...(body ?? {}), clientUuid: crypto.randomUUID() }
        : body

    try {
      await apiFetch<never>(`/v1/tickets/${ticketNo}/${segment}`, {
        method: 'POST',
        ...(payload === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            }),
      })
      void ticketQuery.refetch()
      setLastError(null)
      setFields({})
      setSelectedAction(null)
      return true
    } catch (error) {
      if (error instanceof ApiError) {
        setLastError(actionErrorMessage(error.code, error.params))
        return false
      }
      // Network error (no ApiError): queue the write offline and show the
      // queued notice instead of an error (WP-M5-05).
      const actionKind = (segment === 'comments'
        ? 'comment'
        : segment) as 'acknowledge' | 'comment' | 'decline'
      await queueAction(actionKind, body ?? {})
      return false
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
      setLastError(ticketDeleteErrorMessage(err.code, err.params))
    }
  }

  // Workflow action errors never fall back to the delete text (WP-M5-10).
  function actionErrorMessage(
    code: string | undefined,
    params: Record<string, string | number> | undefined,
  ): string {
    if (!code) return t('detail.errors.actionFailed')
    return t(`detail.errors.${code}`, {
      ...(params ?? {}),
      defaultValue: t('detail.errors.actionFailed'),
    })
  }

  // Translate an API error code into a user-visible message instead of showing
  // a raw code such as `internal_error` (WP-M2-77).
  function ticketDeleteErrorMessage(
    code: string | undefined,
    params: Record<string, string | number> | undefined,
  ): string {
    if (!code) return t('detail.errors.deleteFailed')
    return t(`detail.errors.${code}`, {
      ...(params ?? {}),
      defaultValue: t('detail.errors.deleteFailed'),
    })
  }

  async function handleOption(value: string) {
    if (ticketNo === undefined) {
      return
    }
    setLastError(null)

    if (value === 'list') {
      setSelectedAction(null)
      setOptionsOpen(false)
      navigate('/tickets')
      return
    }

    if (value === 'email') {
      setOptionsOpen(false)
      navigate(`/tickets/${ticketNo}/email`)
      return
    }

    if (value === 'cancel' || value === 'uncancel') {
      setStornoMode(value)
      setStornoReason('')
      setStornoOpen(true)
      setOptionsOpen(false)
      return
    }

    // Workflow actions keep the dropdown open so their inline confirmation
    // panel renders below the chosen entry (review, assign, accept, close …).
    setSelectedAction(value === '' ? null : value)
  }

  async function handleStornoConfirm() {
    if (ticketNo === undefined) {
      return
    }
    const reason = stornoReason.trim()
    if (reason.length < 5) {
      setLastError(t('detail.storno.error'))
      return
    }
    setStornoOpen(false)
    setLastError(null)
    void handleAction(stornoMode === 'cancel' ? 'cancelled' : 'uncancelled', {
      reason,
    })
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
  const timelineData = ticketQuery.data!.timeline

  const sourceLabels: Record<string, string> = {
    QR: t('detail.source.qr'),
    INTERNAL: t('detail.source.internal'),
    API: t('detail.source.api'),
  }
  /** Erfasser: name of the user who recorded the ticket, "System" for QR / e-mail reports. */
  const erfasser =
    ticket.recordedBy ??
    (ticket.source === 'QR' ? t('detail.field.system') : t('detail.field.unknown'))
  const quelle = sourceLabels[ticket.source] ?? t('detail.field.unknown')

  /**
   * Builds the list of dropdown menu entries for the current status.
   * Each entry: { value, labelKey, needsConfirm, confirmLabelKey, abortLabelKey, fieldRenderer? }
   */
  const status = ticket.status
  const req = (name: string) => (fields[name] ?? '').trim()

  async function submitComment() {
    const text = req('commentText')
    if (text === '') {
      setLastError(t('detail.errors.fieldRequired'))
      return
    }
    setLastError(null)
    if (await handleAction('commented', { text })) {
      setNotice(t('detail.comment.saved'))
    }
  }

  const menuEntries: { value: string; labelKey: string; divider?: boolean }[] = []

  menuEntries.push({ value: '__divider__', labelKey: '', divider: true })

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

  menuEntries.push({ value: '__divider__', labelKey: '', divider: true })

  if (status !== 'CANCELLED') {
    menuEntries.push({ value: 'cancel', labelKey: 'detail.menu.cancel' })
  }
  if (status === 'CANCELLED') {
    menuEntries.push({ value: 'uncancel', labelKey: 'detail.menu.uncancel' })
    if (mayDelete) {
      menuEntries.push({ value: 'delete', labelKey: 'detail.menu.delete' })
    }
  }

  menuEntries.push({ value: '__divider__', labelKey: '', divider: true })

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
              name="workOrderType"
              placeholder={t('detail.prompt.workOrderType')}
              value={fields.workOrderType ?? ''}
              onChange={(event) => setFields({ ...fields, workOrderType: event.target.value })}
            />
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              name="workOrderNumber"
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
              name="declineReason"
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
              name="acknowledgeResult"
              placeholder={t('detail.prompt.acknowledgeResult')}
              value={fields.acknowledgeResult ?? ''}
              onChange={(event) => setFields({ ...fields, acknowledgeResult: event.target.value })}
            />
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              name="acknowledgeNote"
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
              name="reopenReason"
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
      case 'cancel': {
        const reason = req('cancelReason')
        const missing = reason === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="w-full rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              name="cancelReason"
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
      default: {
        const segment = selectedAction === null ? undefined : ACTION_SEGMENTS[selectedAction]

        if (segment === undefined) {
          return null
        }

        return (
          <div className="flex flex-wrap gap-2 items-end">
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-emerald-600 hover:bg-emerald-500"
              type="button"
              onClick={() => {
                const action = selectedAction as string
                setSelectedAction(null)
                setFields({})
                void handleAction(action)
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
    }
  }

  function renderOptionsMenu(): ReactNode {
    return (
      <div ref={optionsMenuRef} className="absolute left-0 mt-1 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-40">
        <div className="border-b border-slate-800 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('detail.options.title')}
          </p>
        </div>
        <ul>
          {menuEntries.map((entry) => {
            if (entry.divider) {
              return (
                <li key={entry.value} className="border-t border-slate-800 my-1" />
              )
            }
            const confirmShowing = selectedAction === entry.value && entry.value !== 'pdf' && entry.value !== 'email' && entry.value !== 'list'
            return (
              <li key={entry.value}>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  onClick={() => void handleOption(entry.value)}
                  type="button"
                >
                  {t(entry.labelKey)}
                </button>
                {confirmShowing && (
                  <div className="ml-10 mt-1">{renderConfirmPanel()}</div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  function renderStornoDialog(): ReactNode {
    const isCancel = stornoMode === 'cancel'
    const missing = stornoReason.trim().length < 5
    const titleId = 'storno-dialog-title'
    const hintId = 'storno-dialog-hint'
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        // Only a click on the backdrop itself closes the dialog; clicks inside
        // the panel (e.g. into the text field) must not reach this handler.
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setStornoOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setStornoOpen(false)
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        <button
          onClick={() => setStornoOpen(false)}
          className="absolute top-4 right-4 z-10 p-2 rounded bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={t('detail.photos.close')}
          type="button"
        >
          <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <form
          className="w-full max-w-md p-6 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          onSubmit={(event) => {
            event.preventDefault()
            if (!missing) {
              void handleStornoConfirm()
            }
          }}
        >
          <h2 id={titleId} className="text-lg font-semibold text-slate-100 mb-3">
            {isCancel ? t('detail.storno.title') : t('detail.storno.uncancelTitle')}
          </h2>
          <label className="flex flex-col gap-1 text-sm text-slate-300 mb-1">
            {t('detail.storno.reasonLabel')}
            <input
              autoFocus
              autoComplete="off"
              className="rounded border border-slate-600 bg-slate-800/90 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              value={stornoReason}
              onChange={(event) => setStornoReason(event.target.value)}
            />
          </label>
          <p id={hintId} className={`text-xs mb-3 min-h-4 ${missing && stornoReason.length > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
            {missing && stornoReason.length > 0 ? t('detail.storno.error') : ''}
          </p>
          <div className="flex gap-2">
            <button
              disabled={missing}
              className="min-w-[90px] rounded px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              type="submit"
            >
              {isCancel ? t('detail.storno.confirm') : t('detail.storno.uncancelConfirm')}
            </button>
            <button
              className="min-w-[90px] rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onClick={() => setStornoOpen(false)}
              type="button"
            >
              {t('detail.storno.abort')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Header: title left, status + priority + options right */}
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
            <div className="relative inline-flex">
              <button
                ref={optionsButtonRef}
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                aria-label={t('detail.options.title')}
                data-testid="ticket-options-button"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                onClick={() => setOptionsOpen((current) => !current)}
                title={t('detail.options.title')}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {optionsOpen && renderOptionsMenu()}
            </div>
          </div>
        </div>
      {stornoOpen && renderStornoDialog()}

      {lastError !== null && (
        <div
          className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2.5 text-sm text-rose-200"
          role="alert"
        >
          <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <p className="flex-1">{lastError}</p>
          <button
            className="rounded p-0.5 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            type="button"
            aria-label={t('detail.errors.dismiss')}
            onClick={() => setLastError(null)}
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {notice !== null && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-900/20 px-3 py-2.5 text-sm text-emerald-200"
          role="status"
        >
          <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 13 4 4L19 7" />
          </svg>
          {notice}
        </div>
      )}

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
        markers={timelineData.markers}
        deadlineHours={Math.max(1, Math.round(timelineData.totalMs / 3_600_000))}
        scaleSuffix={t('timeline.scaleSuffix')}
      />

      {/* Objekt: 2 Spalten × 2 Zeilen (Labelzeile + Wertzeile) */}
      <table className="w-full border-collapse rounded-lg border border-slate-700 bg-slate-900/50">
        <tbody>
          <tr>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.object')}
            </th>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.objectNo')}
            </th>
          </tr>
          <tr>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{ticket.objectName}</td>
            <td className="text-left text-sm font-mono text-slate-300 px-3 py-2">
              {ticket.objectNo}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Erfasser / Meldender / Quelle: 3 Spalten × 2 Zeilen (Labelzeile + Wertzeile) */}
      <table className="w-full border-collapse mt-4 rounded-lg border border-slate-700 bg-slate-900/50">
        <tbody>
          <tr>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.erfasser')}
            </th>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.meldender')}
            </th>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.source')}
            </th>
          </tr>
          <tr>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{erfasser}</td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">
              {ticket.reporterName ?? t('detail.field.unknown')}
            </td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{quelle}</td>
          </tr>
        </tbody>
      </table>

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

      {/* Photos: image gallery with click-to-enlarge overlay */}
      {photos.length > 0 && (
        <div className="col-span-full">
          <label className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            {t('detail.photos.title')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => {
              const url = `${apiBaseUrl}/v1/tickets/${ticketNo}/photos/${photo.id}`
              return (
                <div
                  key={photo.id}
                  className="rounded overflow-hidden border border-slate-700 bg-slate-800 aspect-[4/3] group cursor-pointer"
                  onClick={() => setLightbox({ id: photo.id, url })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setLightbox({ id: photo.id, url })
                    }
                  }}
                >
                  <img
                    src={url}
                    alt={t('detail.photos.alt', { index: index + 1 })}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/60 text-[10px] text-slate-200 text-center">
                    {t('detail.photos.sizeKB', { size: (photo.sizeBytes / 1024).toFixed(1) })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lightbox: enlarged photo with download link (JS overlay, no new route) */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t('detail.photos.lightbox')}
        >
          <button
            onClick={(event) => {
              event.stopPropagation()
              setLightbox(null)
            }}
            className="absolute top-4 right-4 z-10 p-2 rounded bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={t('detail.photos.close')}
            type="button"
          >
            <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-w-2xl max-h-[75vh] flex flex-col items-center p-2">
            <img
              src={lightbox.url}
              alt={t('detail.photos.alt', { index: photos.findIndex((p) => p.id === lightbox.id) + 1 })}
              className="max-w-full max-h-[60vh] object-contain rounded border border-slate-600 shadow-2xl"
            />
            <a
              href={lightbox.url}
              download
              className="mt-3 inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {t('detail.photos.download')}
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Comment composer: always visible on active tickets, no trip through the options menu */}
      {status !== 'CLOSED' && status !== 'CANCELLED' && (
        <div className="col-span-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-700/70 bg-slate-800/50 px-4 py-2.5">
            <svg aria-hidden="true" className="h-4 w-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h8M8 14h5m-9 6V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11l-4 4H6a2 2 0 0 1-2-2z" />
            </svg>
            <label htmlFor="ticket-comment" className="text-sm font-medium text-slate-200">
              {t('detail.action.comment')}
            </label>
            <span className="ml-auto text-xs text-slate-500">{t('detail.comment.hint')}</span>
          </div>
          <div className="p-4">
            <textarea
              id="ticket-comment"
              className="min-h-24 w-full resize-y rounded-lg border border-slate-600 bg-slate-950/40 px-3.5 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
              rows={3}
              maxLength={2000}
              name="commentText"
              placeholder={t('detail.comment.placeholder')}
              value={fields.commentText ?? ''}
              onChange={(event) => setFields({ ...fields, commentText: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void submitComment()
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {req('commentText').length > 0
                  ? t('detail.comment.counter', {
                      count: (fields.commentText ?? '').length,
                      max: 2000,
                    })
                  : t('detail.comment.shortcut')}
              </span>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-sky-600 shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                type="button"
                disabled={req('commentText') === ''}
                onClick={() => void submitComment()}
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19V5m0 0-6 6m6-6 6 6" />
                </svg>
                {t('detail.comment.submit')}
              </button>
            </div>
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
                <div className="w-32 shrink-0 whitespace-nowrap">
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
                  {(() => {
                    const text =
                      typeof event.payload.text === 'string'
                        ? event.payload.text
                        : typeof event.payload.reason === 'string'
                          ? event.payload.reason
                          : null
                    if (text === null || text.trim() === '') {
                      return null
                    }
                    return event.type === 'comment' ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg border-l-2 border-sky-500/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200">
                        {text}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">{text}</p>
                    )
                  })()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <OfflineActionBanner rows={rows} onRetry={deliverNow} onDiscard={discard} />
    </section>
  )
}
