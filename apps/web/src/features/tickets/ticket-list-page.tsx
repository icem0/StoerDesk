import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TicketListItem, TicketListResponse, TimelineState } from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * Ticket list page (`PLAN.md` §13, §14, WP-M2-17b, WP-M9-21).
 *
 * Paginated ticket list with search and filters (status, priority). Every
 * ticket is one line: the ticket number and the object on the left, the mini
 * timeline (WP-M6-12) in the middle, the status, the priority and the times
 * on the right. The whole line is one link to the ticket detail, and the rows
 * come in the deadline order of WP-M9-20 — the nearest deadline is on top.
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

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-900/30 text-slate-300',
  normal: 'bg-blue-900/30 text-blue-300',
  high: 'bg-amber-900/30 text-amber-300',
  critical: 'bg-rose-900/30 text-rose-300',
}

/** Mini timeline colours of the list bar (WP-M6-12, `specs/05-timeline.md` §5.3). */
const STATE_COLOUR: Record<TimelineState, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-rose-500',
  stopped: 'bg-slate-500',
}

function useTickets(query: {
  search?: string
  status?: string
  priority?: string
  open?: string
  overdue?: string
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.status) params.set('status', query.status)
  if (query.priority) params.set('priority', query.priority)
  if (query.open) params.set('open', query.open)
  if (query.overdue) params.set('overdue', query.overdue)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.offset !== undefined) params.set('offset', String(query.offset))

  // The office reads the list by the deadline: the nearest one is on top
  // (WP-M9-20, `specs/05-timeline.md` §5.4).
  params.set('order', 'deadlineAt')
  params.set('direction', 'asc')

  return useQuery({
    queryKey: ['tickets', 'list', query],
    queryFn: () => apiFetch<TicketListResponse>(`/v1/tickets?${params.toString()}`),
    retry: false,
  })
}

/**
 * One ticket as a line (WP-M9-21, `PLAN.md` §14): the ticket number and the
 * object on the left, the mini timeline in the middle, the status, the priority
 * and the times on the right. The whole line is one link to the ticket detail.
 * Below `md` the line stacks, so the phone shows the same information without
 * a horizontal scroll.
 */
function TicketRow({ ticket }: { ticket: TicketListItem }) {
  const { t, i18n } = useTranslation('ticket')

  const [fetchedAt] = useState(() => Date.now())

  const deadlineMs = new Date(ticket.deadlineAt).getTime()
  const hoursLeft = Math.ceil(ticket.remainingMs / 3_600_000)
  const hoursOver = Number.isFinite(deadlineMs)
    ? Math.max(0, Math.ceil((fetchedAt - deadlineMs) / 3_600_000))
    : 0
  const remainingLabel =
    ticket.timelineState === 'stopped'
      ? t('list.remaining.stopped')
      : ticket.timelineState === 'red'
        ? t('list.remaining.overdue', { hours: hoursOver })
        : t('list.remaining.left', { hours: hoursLeft })

  const timeFormat: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  const deadline = new Date(ticket.deadlineAt).toLocaleString(i18n.language, timeFormat)
  const reported = new Date(ticket.reportedAt).toLocaleString(i18n.language, timeFormat)

  return (
    <li data-testid="ticket-row">
      <Link
        className="grid min-h-11 grid-cols-1 gap-x-4 gap-y-2 px-3 py-3 transition-colors hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center"
        to={`/tickets/${ticket.ticketNo}`}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-sm font-semibold text-sky-300">
              {ticket.ticketNo}
            </span>
            <span className="truncate text-sm font-medium text-slate-200">{ticket.objectName}</span>
          </span>
          <span className="truncate font-mono text-xs text-slate-500">{ticket.objectNo}</span>
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <span className="relative h-1.5 min-w-16 flex-1 overflow-hidden rounded bg-slate-700">
            <span
              className={`block h-full rounded ${STATE_COLOUR[ticket.timelineState]}`}
              style={{ width: `${Math.min(100, Math.max(0, ticket.percent))}%` }}
            />
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs text-slate-400" title={deadline}>
            {remainingLabel}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2 md:justify-end">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-slate-900/30 text-slate-300'}`}
          >
            {t(`status.values.${ticket.status}`) ?? ticket.status}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[ticket.priority] ?? 'bg-slate-900/30 text-slate-300'}`}
          >
            {t(`priority.${ticket.priority}`) ?? ticket.priority}
          </span>
          <span className="w-full text-xs text-slate-500 md:w-auto">
            {t('list.row.times', { reported, deadline })}
          </span>
        </span>
      </Link>
    </li>
  )
}

export function TicketListPage() {
  const { t } = useTranslation('ticket')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // The URL is the single source of truth, so the dashboard tiles open the list
  // with the matching filter (WP-M2-22, WP-M2-23).
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const open = searchParams.get('open') === 'true'
  const overdue = searchParams.get('overdue') === 'true'
  const offset = Number(searchParams.get('offset') ?? '0')

  function updateFilter(key: string, value: string, active: boolean) {
    const next = new URLSearchParams(searchParams)

    if (value === '' || !active) {
      next.delete(key)
    } else {
      next.set(key, value)
    }

    next.delete('offset')
    setSearchParams(next)
  }

  const tickets = useTickets({
    search,
    status,
    priority,
    open: open ? 'true' : undefined,
    overdue: overdue ? 'true' : undefined,
    limit: 25,
    offset,
  })

  const filtered = useMemo(() => {
    const rows = tickets.data?.tickets ?? []

    if (search === '') return rows
    const needle = search.toLowerCase()
    return rows.filter(
      (row) =>
        row.ticketNo.toLowerCase().includes(needle) ||
        row.objectName.toLowerCase().includes(needle) ||
        row.objectNo.toLowerCase().includes(needle),
    )
  }, [tickets.data?.tickets, search])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('list.title')}</h1>
          <p className="text-sm text-slate-400">{t('list.hint')}</p>
        </div>
        <button
          className="min-h-11 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          type="button"
          onClick={() => navigate('/tickets/create')}
        >
          {t('list.actions.create')}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          {t('list.search')}
          <input
            className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
            type="search"
            value={search}
            onChange={(event) => updateFilter('search', event.target.value, true)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('list.status')}
          <select
            className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
            value={status}
            onChange={(event) => updateFilter('status', event.target.value, true)}
          >
            <option value="">{t('list.statusAll')}</option>
            <option value="NEW">{t('list.statusNew')}</option>
            <option value="IN_REVIEW">{t('list.statusInReview')}</option>
            <option value="WORK_ORDER_CREATED">{t('list.statusWorkOrder')}</option>
            <option value="OFFERED">{t('list.statusOffered')}</option>
            <option value="ASSIGNED">{t('list.statusAssigned')}</option>
            <option value="ACCEPTED">{t('list.statusAccepted')}</option>
            <option value="ACKNOWLEDGED">{t('list.statusAcknowledged')}</option>
            <option value="CLOSED">{t('list.statusClosed')}</option>
            <option value="CANCELLED">{t('list.statusCancelled')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('list.priority')}
          <select
            className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
            value={priority}
            onChange={(event) => updateFilter('priority', event.target.value, true)}
          >
            <option value="">{t('list.priorityAll')}</option>
            <option value="low">{t('list.priorityLow')}</option>
            <option value="normal">{t('list.priorityNormal')}</option>
            <option value="high">{t('list.priorityHigh')}</option>
            <option value="critical">{t('list.priorityCritical')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={open}
            onChange={(event) => updateFilter('open', 'true', event.target.checked)}
            type="checkbox"
          />
          {t('list.filterOpen')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={overdue}
            onChange={(event) => updateFilter('overdue', 'true', event.target.checked)}
            type="checkbox"
          />
          {t('list.filterOverdue')}
        </label>
      </div>

      {tickets.isPending ? (
        <p className="text-slate-400">{t('list.loading')}</p>
      ) : tickets.isError ? (
        <p className="text-rose-400" role="alert">{t('list.loadError')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400">{t('list.noTickets')}</p>
      ) : (
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/40">
          {filtered.map((ticket) => (
            <TicketRow key={ticket.ticketNo} ticket={ticket} />
          ))}
        </ul>
      )}

      {tickets.data !== undefined && (
        <div className="flex gap-3 text-sm text-slate-400">
          <span>{t('list.range', { from: offset + 1, to: Math.min(offset + filtered.length, tickets.data.total), total: tickets.data.total })}</span>
          {offset > 0 && (
            <button
              className="min-h-11 rounded bg-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-600"
              onClick={() => updateFilter('offset', String(Math.max(0, offset - 25)), true)}
            >
              {t('list.prev')}
            </button>
          )}
          {offset + filtered.length < tickets.data.total && (
            <button
              className="min-h-11 rounded bg-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-600"
              onClick={() => updateFilter('offset', String(offset + 25), true)}
            >
              {t('list.next')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
