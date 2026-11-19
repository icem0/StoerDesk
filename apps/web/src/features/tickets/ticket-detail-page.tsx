import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { DisplaySettingsResponse, TicketDetailResponse } from '@stoerdesk/shared'
import type { StandardTextLocale } from '@stoerdesk/shared'

import { apiBaseUrl, apiFetch, ApiError } from '../../lib/api'
import { i18n } from '../../i18n'
import { usePermission } from '../../auth/usePermission'
import { useFaultCatalog } from './use-fault-catalog'
import { useInternalActions } from './use-internal-actions'
import { OfflineActionBanner } from './offline-action-banner'
import { TicketTimeline } from './ticket-timeline'

/**
 * Ticket detail page (`PLAN.md` §14, WP-M2-18b / WP-M2-19d / WP-M4-07 / WP-M12-06).
 *
 * Layout per user request:
 * - Header: ticket number + object on the left, status + priority badges on the top
 *   right, next to them the send view as a paper-plane icon button (WP-M14-22) and the cancel
 *   button (WP-M12-09).
 * - Timeline bar directly under the header: "Gemeldet am" left, "Reaktionszeit bis" right,
 *   6 h scale markings below the bar, milestone dots on the bar.
 * - Object row: object name + object number side by side, labels above.
 * - Three fields side by side: Erfasser, Meldender, Quelle with labels above.
 * - Description, photos, history follow below.
 * - The escalation section carries the stages the ticket can still reach as
 *   buttons next to each other (WP-M14-153): the selection was a pulldown, which
 *   a touch screen cannot use well. A click runs the workflow transition of that
 *   milestone with its own form, which opens below the buttons (WP-M13-09). The
 *   actions that are no milestone (decline, claim, cancel, delete) stay buttons;
 *   the comment goes to the comment route.
 * - The top-right hamburger menu is gone (WP-M12-06).
 * - The way back to the list is gone for good (WP-M12-09).
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

/**
 * Every history entry carries the date next to the clock time, so entries of
 * different days stay readable.
 */
function formatEventDateTime(iso: string): string {
  const locale = i18n.language === 'en' ? 'en-US' : 'de-DE'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
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
  internal_commented: 'comments/internal',
  closed: 'close',
  reopened: 'reopen',
  cancelled: 'cancel',
  uncancelled: 'uncancel',
}

/**
 * The stage selection offers the events that reach a stage; each event carries
 * the label of its workflow step (`specs/07-escalation.md` §7.10, WP-M13-09).
 */
const ACTION_LABELS: Record<string, string> = {
  review_started: 'detail.action.review',
  work_order_set: 'detail.action.workOrder',
  assigned: 'detail.action.assign',
  offered: 'detail.action.offer',
  claimed: 'detail.action.assign',
  accepted: 'detail.action.accept',
  acknowledged: 'detail.action.acknowledge',
}

/**
 * The four results of the acknowledge step, in the order of the API contract
 * (`ACK_RESULT` of `apps/api/src/tickets/workflow-routes.ts`, PLAN.md §7). The
 * panel offers them as a selection, so the office cannot mistype the value.
 */
const ACKNOWLEDGE_RESULTS = [
  'fixed',
  'partially_fixed',
  'follow_up_required',
  'no_fault_found',
] as const

/**
 * The default colour of the internal comment: a dark red (ADR-0034). The
 * administration sets the real value under „Darstellung".
 */
const DEFAULT_INTERNAL_COMMENT_COLOR = '#7f1d1d'

/**
 * The text colour that stays readable on the configured background — the
 * contrast rule of `PLAN.md` §14. A dark colour takes a light text, a light
 * colour a dark one.
 */
function textOnColor(color: string): string {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color)

  if (hex === null) {
    return 'text-slate-100'
  }

  const value = hex[1] ?? ''
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness > 140 ? 'text-slate-900' : 'text-slate-100'
}

export function TicketDetailPage() {
  const { t, i18n } = useTranslation('ticket')
  const navigate = useNavigate()
  const { ticketNo } = useParams()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [lastError, setLastError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ id: string; url: string } | null>(null)
  const [stornoOpen, setStornoOpen] = useState(false)
  const [stornoReason, setStornoReason] = useState('')
  const [stornoMode, setStornoMode] = useState<'cancel' | 'uncancel'>('cancel')
  const [commentConfirmOpen, setCommentConfirmOpen] = useState(false)
  const [internalComment, setInternalComment] = useState(false)
  const [detectedErrorKeysSelected, setDetectedErrorKeysSelected] = useState<string[]>([])
  const [detectedErrorsOptions, setDetectedErrorsOptions] = useState<{
    key: string
    labelDe: string
    labelEn: string
  }[]>([])

  useEffect(() => {
    if (notice === null) {
      return
    }
    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (selectedAction !== 'closed') return

    void (async () => {
      try {
        const data = await apiFetch<{ detectedErrors: { key: string; labelDe: string; labelEn: string; archivedAt: string | null; createdAt: string; updatedAt: string }[] }>(
          '/v1/detected-errors',
        )
        setDetectedErrorsOptions(
          data.detectedErrors
            .filter((e) => e.archivedAt === null)
            .map((e) => ({ key: e.key, labelDe: e.labelDe, labelEn: e.labelEn })),
        )
      } catch {
        setDetectedErrorsOptions([])
      }
    })()
  }, [selectedAction])

  const ticketQuery = useTicket(ticketNo)
  const mayDelete = usePermission('ticket.delete')
  const mayWriteInternal = usePermission('ticket.comment.internal')
  const { queueAction, deliverNow, discard, pendingCount, rows } = useInternalActions(ticketNo ?? '')

  // The colour of the internal comment (ADR-0034): a presentation value of the
  // instance, every colleague who may read a ticket may read it.
  const display = useQuery({
    queryKey: ['settings', 'display'],
    queryFn: () => apiFetch<DisplaySettingsResponse>('/v1/settings/display'),
    retry: false,
  })

  /**
   * The whole stage chain of the installation (`GET /api/v1/escalation-stages`,
   * §7.9): the ticket history names the stage of a firing with the display name
   * the administration maintains and spares the firing of the first stage — the
   * arrival of the ticket (§7.11, WP-M14-152c).
   */
  const stageChain = useQuery({
    queryKey: ['escalation', 'stages'],
    queryFn: () =>
      apiFetch<{
        stages: { key: string; names: Record<string, string>; predecessor: string | null }[]
      }>('/v1/escalation-stages'),
    retry: false,
  })

  const internalCommentColor = display.data?.internalCommentColor ?? DEFAULT_INTERNAL_COMMENT_COLOR

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
      segment === 'comments' || segment === 'comments/internal'
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
      // queued notice instead of an error (WP-M5-05). The internal comment
      // keeps its own kind — a queued normal comment would be printed with the
      // prepared send view (ADR-0034).
      const actionKind = (
        segment === 'comments'
          ? 'comment'
          : segment === 'comments/internal'
            ? 'internal_comment'
            : segment
      ) as 'acknowledge' | 'comment' | 'internal_comment' | 'decline'
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

  // Workflow action errors never fall back to the delete text (WP-M5-10), and
  // they name their reason (WP-M14-77): the error code of the API becomes a
  // sentence, so the office sees why the action failed instead of the generic
  // notice. A code without a text keeps the generic notice.
  function actionErrorMessage(
    code: string | undefined,
    params: Record<string, string | number> | undefined,
  ): string {
    if (!code) return t('detail.errors.actionFailed')

    if (code === 'invalid_transition') {
      const from = params?.from

      return t('detail.errors.invalid_transition', {
        status:
          typeof from === 'string'
            ? t(`status.values.${from}`, { defaultValue: from })
            : t('detail.field.unknown'),
      })
    }

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

    if (value === 'send') {
      navigate(`/tickets/${ticketNo}/send`)
      return
    }

    if (value === 'cancel' || value === 'uncancel') {
      setStornoMode(value)
      setStornoReason('')
      setStornoOpen(true)
      return
    }

    // Workflow actions render their inline confirmation panel below the buttons
    // (review, assign, accept, close …).
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
  const createdEvent = events.find((event) => event.type === 'created')
  const reportedMs = Date.parse(ticket.reportedAt)
  const createdMs =
    createdEvent === undefined ? Number.NaN : Date.parse(createdEvent.createdAt)
  /** A backdated report gets its own marker at the start of the bar (WP-M2-98d). */
  const backdatedReport =
    Number.isFinite(reportedMs) &&
    Number.isFinite(createdMs) &&
    Math.abs(createdMs - reportedMs) > 60_000
  const timelineMarkers = backdatedReport
    ? [{ type: 'reported', at: ticket.reportedAt }, ...timelineData.markers]
    : timelineData.markers

  const payloadString = (key: string) => {
    const value = createdEvent?.payload[key]

    return typeof value === 'string' ? value : null
  }
  const reporterChannel = payloadString('reporterChannel')
  const reporterKind = payloadString('reporterKind')
  const channelLabel =
    reporterChannel === null
      ? t('detail.field.unknown')
      : t(`detail.channel.${reporterChannel}`, { defaultValue: reporterChannel })
  const reporterKindLabel =
    reporterKind === null
      ? t('detail.field.unknown')
      : t(`detail.reporterKind.${reporterKind}`, { defaultValue: reporterKind })

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

  /** The stages the ticket can still reach; the server owns the transition map. */
  const availableStages = ticketQuery.data?.availableStages ?? []
  const stageName = (stage: { names: Record<string, string> }): string =>
    stage.names[locale] ?? stage.names.en ?? stage.names.de ?? ''

  const chain = stageChain.isSuccess ? (stageChain.data.stages ?? []) : []
  const chainName = (key: string): string => {
    const stage = chain.find((entry) => entry.key === key)

    return stage === undefined
      ? t('detail.field.unknown')
      : stage.names[locale] ?? stage.names.en ?? stage.names.de ?? t('detail.field.unknown')
  }
  const firstStageKey = chain.find((entry) => entry.predecessor === null)?.key ?? null

  /** The stage key an event payload names, `null` when it carries no stage. */
  const eventStageKey = (payload: Record<string, unknown>): string | null =>
    typeof payload.stageKey === 'string'
      ? payload.stageKey
      : typeof payload.stage === 'string'
        ? payload.stage
        : null

  /**
   * What the escalation configured for a notification row (§11.8, WP-M14-152a,
   * WP-M14-152b): the channel, the addressee of a personal message and the
   * target of the action. The names are display data of the installation — no
   * topic, no token and no address ever arrives in the payload.
   */
  const notificationDetails = (payload: Record<string, unknown>): string | null => {
    const parts: string[] = []

    if (typeof payload.channel === 'string') {
      parts.push(t(`detail.notification.channels.${payload.channel}`, {
        defaultValue: payload.channel,
      }))
    }

    if (typeof payload.recipient === 'string') {
      parts.push(t('detail.notification.recipient', { name: payload.recipient }))
    }

    if (typeof payload.target === 'string') {
      parts.push(t('detail.notification.target', { name: payload.target }))
    }

    return parts.length === 0 ? null : parts.join(' · ')
  }

  /**
   * The firing of the first stage is the arrival of the ticket (§7.11): the audit
   * row and the actions of the rule stay in the database, the history shows no
   * row for it — the report entry already says that the ticket arrived
   * (WP-M14-152c).
   */
  const historyEvents = events.filter(
    (event) =>
      !(
        event.type === 'escalated' &&
        firstStageKey !== null &&
        eventStageKey(event.payload) === firstStageKey
      ),
  )

  /**
   * The technicians the escalation assigned to this ticket (§7.14, ADR-0026,
   * WP-M14-85) — name only, no contact value; empty for a ticket that was never
   * distributed.
   */
  const assignees = ticket.assignees ?? []

  /**
   * Builds the list of workflow entries for the current status. The entries are
   * visible buttons in the escalation/action section; the menu was removed. The
   * send view and the cancel button live in the header (WP-M12-09, WP-M14-22).
   */
  const status = ticket.status

  /**
   * The milestones the ticket can still reach, one button each (WP-M14-153):
   * a selection is hard to use on a touch screen, so the reachable steps stand
   * next to each other. The wording is the wording of the former selection: the
   * name of the milestone, or the name of the step when one milestone is
   * reached by several steps.
   */
  const stageButtons = availableStages.flatMap((stage) =>
    stage.events.map((event) => ({
      key: `${stage.key}:${event}`,
      event,
      label:
        stage.events.length === 1 || ACTION_LABELS[event] === undefined
          ? stageName(stage)
          : t(ACTION_LABELS[event]),
    })),
  )
  const req = (name: string) => (fields[name] ?? '').trim()

  async function submitComment() {
    const text = req('commentText')
    if (text === '') {
      setLastError(t('detail.errors.fieldRequired'))
      return
    }
    setLastError(null)
    // A comment is append-only: it can neither be changed nor be deleted after
    // it was saved (PLAN.md §6.1). The dialog names that before the write.
    setCommentConfirmOpen(true)
  }

  async function saveComment() {
    const text = req('commentText')
    setCommentConfirmOpen(false)
    // The internal comment goes to its own route (ADR-0034): the note of the
    // colleagues never reaches the customer.
    const event = internalComment ? 'internal_commented' : 'commented'

    if (await handleAction(event, { text })) {
      setNotice(t(internalComment ? 'detail.comment.internalSaved' : 'detail.comment.saved'))
      setInternalComment(false)
    }
  }

  const menuEntries: { value: string; labelKey: string }[] = []

  // The milestones of the workflow are reached through the stage selection
  // below; the entries here are the actions that are no milestone.
  if (status === 'OFFERED' || status === 'ASSIGNED') {
    menuEntries.push({ value: 'declined', labelKey: 'detail.action.decline' })
  } else if (status === 'ACKNOWLEDGED') {
    menuEntries.push({ value: 'closed', labelKey: 'detail.action.close' })
  } else if (status === 'CLOSED') {
    menuEntries.push({ value: 'reopened', labelKey: 'detail.action.reopen' })
  }

  if (status === 'CANCELLED' && mayDelete) {
    menuEntries.push({ value: 'delete', labelKey: 'detail.menu.delete' })
  }

  function renderConfirmPanel(): ReactNode {
    switch (selectedAction) {
      case 'work_order_set': {
        const text = req('workOrderText')
        const missing = text === ''
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <input
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11 w-full sm:w-80"
              name="workOrderText"
              placeholder={t('detail.prompt.workOrderText')}
              value={fields.workOrderText ?? ''}
              onChange={(event) => setFields({ ...fields, workOrderText: event.target.value })}
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
                  text: req('workOrderText'),
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
            <select
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              name="acknowledgeResult"
              aria-label={t('detail.prompt.acknowledgeResult')}
              value={fields.acknowledgeResult ?? ''}
              onChange={(event) => setFields({ ...fields, acknowledgeResult: event.target.value })}
            >
              <option value="">{t('detail.prompt.acknowledgeResult')}</option>
              {ACKNOWLEDGE_RESULTS.map((value) => (
                <option key={value} value={value}>
                  {t(`detail.acknowledgeResult.${value}`)}
                </option>
              ))}
            </select>
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
      case 'closed': {
        const comment = fields.closeComment ?? ''
        const selected = detectedErrorKeysSelected
        return (
          <div className="flex flex-wrap gap-2 items-end">
            <textarea
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
              name="closeComment"
              placeholder={t('detail.prompt.closeComment')}
              value={comment}
              onChange={(event) => setFields({ ...fields, closeComment: event.target.value })}
            />
            <div className="flex items-end gap-2">
              <label className="text-xs text-slate-400">{t('detail.prompt.detectedErrors')}</label>
              <select
                className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none min-h-11"
                multiple
                size={3}
                value={selected}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  )
                  setDetectedErrorKeysSelected(values)
                }}
              >
                {detectedErrorsOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.labelDe} / {option.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="min-h-11 rounded px-4 py-2 text-sm font-medium text-slate-200 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              type="button"
              onClick={() => {
                setSelectedAction(null)
                void handleAction('closed', {
                  comment: comment === '' ? undefined : comment,
                  detectedErrorKeys:
                    detectedErrorKeysSelected.length > 0
                      ? detectedErrorKeysSelected
                      : undefined,
                })
                setFields({})
                setDetectedErrorKeysSelected([])
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
                setDetectedErrorKeysSelected([])
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

  /**
   * The warning before a comment is written: the comment is an append-only
   * event of the ticket and can neither be changed nor be deleted afterwards
   * (PLAN.md §6.1). The text is shown again in the dialog, so the last check
   * happens before the write.
   */
  function renderCommentConfirmDialog(): ReactNode {
    const titleId = 'comment-confirm-title'
    const hintId = 'comment-confirm-hint'
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        // Only a click on the backdrop itself closes the dialog; clicks inside
        // the panel must not reach this handler.
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setCommentConfirmOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setCommentConfirmOpen(false)
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        <div className="w-full max-w-md p-6 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <h2 id={titleId} className="text-lg font-semibold text-slate-100 mb-3">
            {t(internalComment ? 'detail.comment.internalConfirmTitle' : 'detail.comment.confirmTitle')}
          </h2>
          <p id={hintId} className="text-sm text-slate-300 mb-3">
            {t(internalComment ? 'detail.comment.internalConfirmText' : 'detail.comment.confirmText')}
          </p>
          <p
            className="mb-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 px-3 py-2 text-sm"
            style={
              internalComment
                ? {
                    backgroundColor: internalCommentColor,
                    borderLeftColor: internalCommentColor,
                  }
                : undefined
            }
          >
            <span className={internalComment ? textOnColor(internalCommentColor) : 'text-slate-200'}>
              {fields.commentText ?? ''}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              className="min-w-[90px] rounded px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              onClick={() => void saveComment()}
              type="button"
            >
              {t('detail.comment.confirmSubmit')}
            </button>
            <button
              className="min-w-[90px] rounded px-4 py-2 text-sm font-medium text-slate-200 bg-slate-600 hover:bg-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onClick={() => setCommentConfirmOpen(false)}
              type="button"
            >
              {t('detail.comment.confirmAbort')}
            </button>
          </div>
        </div>
      </div>
    )
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span
            data-testid="ticket-status-badge"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
          >
            {t(`status.values.${ticket.status}`) ?? ticket.status}
          </span>
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-900/30 text-slate-300">
            {t(`priority.${ticket.priority}`) ?? ticket.priority}
          </span>
          {/* The header actions: the send view as a paper-plane icon (WP-M14-22)
              and the cancel button next to it (WP-M12-09). */}
          <div
            data-testid="ticket-header-actions"
            className="flex items-center gap-2 sm:ml-1"
          >
            <button
              aria-label={t('detail.menu.send')}
              title={t('detail.menu.send')}
              data-testid="ticket-send-button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              onClick={() => void handleOption('send')}
              type="button"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m22 2-11 16-7-12 22-4z" />
              </svg>
            </button>
            <button
              data-testid="ticket-cancel-button"
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              onClick={() => void handleOption(status === 'CANCELLED' ? 'uncancel' : 'cancel')}
              type="button"
            >
              {status === 'CANCELLED' ? t('detail.menu.uncancel') : t('detail.menu.cancel')}
            </button>
          </div>
        </div>
      </div>
      {assignees.length > 0 ? (
        <div
          data-testid="ticket-assignees"
          className="flex flex-wrap items-center gap-2 text-sm text-slate-300"
        >
          <span className="text-xs uppercase-tracking text-slate-400">
            {t('detail.assignees.title')}
          </span>
          {assignees.map((assignee) => (
            <span
              key={assignee.id}
              className="rounded px-2 py-0.5 bg-slate-900/40 text-slate-200"
            >
              {assignee.name}
            </span>
          ))}
        </div>
      ) : null}

      {stornoOpen && renderStornoDialog()}
      {commentConfirmOpen && renderCommentConfirmDialog()}

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
        receivedAt={ticket.receivedAt}
        deadlineAt={timelineData.deadlineAt}
        stoppedAt={timelineData.stoppedAt}
        markers={timelineMarkers}
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
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.channel')}
            </th>
            <th
              className="text-left text-xs text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-700 bg-slate-800/50 font-medium"
              scope="col"
            >
              {t('detail.field.reporterKind')}
            </th>
          </tr>
          <tr>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{erfasser}</td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">
              {ticket.reporterName ?? t('detail.field.unknown')}
            </td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{quelle}</td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{channelLabel}</td>
            <td className="text-left text-sm text-slate-200 px-3 py-2">{reporterKindLabel}</td>
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
              className="mt-3 inline-flex items-center gap-1.5 rounded bg-accent-600 px-3 py-1.5 text-xs text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              {t('detail.photos.download')}
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Escalation and workflow actions: the send view and the cancel button
          live in the header (WP-M12-09, WP-M14-22). */}
      <div
        data-testid="ticket-action-section"
        className="col-span-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm"
      >
        <div className="flex items-center gap-2 border-b border-slate-700/70 bg-slate-800/50 px-4 py-2.5">
          <svg aria-hidden="true" className="h-4 w-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h8M8 14h5m-9 6V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11l-4 4H6a2 2 0 0 1-2-2z" />
          </svg>
          <span className="text-sm font-medium text-slate-200">
            {t('detail.escalation.title')}
          </span>
          <span className="ml-auto text-xs text-slate-500">{t('detail.escalation.hint')}</span>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-700/70 px-4 py-3">
          {status !== 'CLOSED' && status !== 'CANCELLED' && stageButtons.length > 0 && (
            <div>
              <p className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t('detail.escalation.stageLabel')}
              </p>
              <div className="flex flex-wrap gap-2" data-testid="ticket-escalation-stages">
                {stageButtons.map((button) => (
                  <button
                    key={button.key}
                    data-testid={`ticket-stage-${button.event}`}
                    className="min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    onClick={() => void handleOption(button.event)}
                    type="button"
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {menuEntries.map((entry) => (
              <button
                key={entry.value}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                onClick={() => void handleOption(entry.value)}
                type="button"
              >
                {t(entry.labelKey)}
              </button>
            ))}
          </div>

          {selectedAction !== null && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              {renderConfirmPanel()}
            </div>
          )}
        </div>

        {status !== 'CLOSED' && status !== 'CANCELLED' && (
          <div className="p-4">
            {mayWriteInternal ? (
              <>
                <label className="flex items-start gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    name="internalComment"
                    checked={internalComment}
                    onChange={(event) => setInternalComment(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>{t('detail.comment.internalLabel')}</span>
                </label>
                <p className="mt-1 text-xs text-slate-500">{t('detail.comment.internalHint')}</p>
              </>
            ) : null}
            <label
              htmlFor="ticket-comment"
              className="mt-3 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              {t('detail.escalation.textLabel')}
            </label>
            <textarea
              id="ticket-comment"
              className="min-h-24 w-full resize-y rounded-lg border border-slate-600 bg-slate-950/40 px-3.5 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              style={
                internalComment
                  ? { backgroundColor: internalCommentColor, borderColor: internalCommentColor }
                  : undefined
              }
              rows={3}
              maxLength={2000}
              name="commentText"
              lang={locale}
              spellCheck
              placeholder={t('detail.escalation.placeholder')}
              value={fields.commentText ?? ''}
              onChange={(event) => setFields({ ...fields, commentText: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void saveComment()
                }
              }}
            />
            <p className="mt-2 text-xs text-slate-500">{t('detail.comment.spellcheck')}</p>
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
                data-testid="ticket-escalation-submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-accent-600 shadow-sm hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                type="button"
                disabled={req('commentText') === ''}
                onClick={() => void submitComment()}
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19V5m0 0-6 6m6-6 6 6" />
                </svg>
                {t(internalComment ? 'detail.comment.internalSubmit' : 'detail.comment.submit')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History / Verlauf */}
      <div className="col-span-full">
        <label className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          {t('detail.history')}
        </label>
        <div data-testid="ticket-history" className="border border-slate-700 rounded divide-y divide-slate-700">
          {events.length === 0 ? (
            <p className="p-3 text-slate-400">{t('detail.historyEmpty')}</p>
          ) : (
            <>
              {backdatedReport ? (
                <div className="p-3 flex gap-3" data-testid="history-reported">
                  <div className="w-36 shrink-0 whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-500">
                      {formatEventDateTime(ticket.reportedAt)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">
                      {t('status.events.reported')}
                    </div>
                    <div className="text-xs text-slate-400">
                      {ticket.reporterName ?? t('detail.field.unknown')}
                    </div>
                  </div>
                </div>
              ) : null}
              {historyEvents.map((event) => (
              <div key={event.id} className="p-3 flex gap-3">
                <div className="w-36 shrink-0 whitespace-nowrap">
                  <span className="text-xs font-mono text-slate-500">
                    {formatEventDateTime(event.createdAt)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">
                    {t(`status.events.${event.type}`) ?? event.type}
                  </div>
                  <div className="text-xs text-slate-400">
                    {event.actorKind === 'user'
                      ? (event.actorName ?? t('detail.field.unknown'))
                      : event.actorKind === 'public'
                        ? t('detail.actor.external', {
                            name: event.actorName ?? t('detail.field.unknown'),
                          })
                        : t(`actorKind.${event.actorKind}`)}
                  </div>
                  {(() => {
                    const stageKey = eventStageKey(event.payload)
                    const stage =
                      stageKey === null
                        ? null
                        : typeof event.payload.stageName === 'string'
                          ? event.payload.stageName
                          : chainName(stageKey)
                    const text =
                      typeof event.payload.text === 'string'
                        ? event.payload.text
                        : typeof event.payload.reason === 'string'
                          ? event.payload.reason
                          : null
                    const details =
                      event.type === 'notification_sent' ||
                      event.type === 'notification_failed'
                        ? notificationDetails(event.payload)
                        : null
                    const hasText = text !== null && text.trim() !== ''

                    if (!hasText && stage === null && details === null) {
                      return null
                    }

                    return (
                      <>
                        {stage !== null && (
                          <p className="mt-1 text-xs text-accent-300">
                            {t('detail.escalation.historyStage', { stage })}
                          </p>
                        )}
                        {details !== null && (
                          <p className="mt-1 text-xs text-slate-400">{details}</p>
                        )}
                        {hasText && (
                          <p
                            className={
                              event.type === 'internal_comment'
                                ? `mt-2 whitespace-pre-wrap rounded-lg border-l-2 px-3 py-2 text-sm ${textOnColor(internalCommentColor)}`
                                : event.type === 'comment' || event.type === 'escalation_set'
                                  ? 'mt-2 whitespace-pre-wrap rounded-lg border-l-2 border-accent-500/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200'
                                  : 'mt-1 text-xs text-slate-400'
                            }
                            style={
                              event.type === 'internal_comment'
                                ? {
                                    backgroundColor: internalCommentColor,
                                    borderLeftColor: internalCommentColor,
                                  }
                                : undefined
                            }
                          >
                            {text}
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
              ))}
            </>
          )}
        </div>
      </div>

      <OfflineActionBanner
        rows={rows}
        onRetry={async (row) => {
          await deliverNow(row)
          // The replayed comment is an event of the ticket: read the ticket
          // again, so it shows up in the history at once (WP-M5-17).
          void ticketQuery.refetch()
        }}
        onDiscard={discard}
      />
    </section>
  )
}
