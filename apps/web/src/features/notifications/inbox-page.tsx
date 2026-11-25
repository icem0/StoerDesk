import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link, useSearchParams } from 'react-router-dom'

import type {
  NotificationItem,
  NotificationItemListResponse,
  WebPushConfigResponse,
  WebPushSubscriptionCheckResponse,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'
import { type BrowserPush, useBrowserPush } from '../../lib/web-push'
import { AdminLayout } from '../../components/admin-layout'

/** The cause of the hint of the web push; `none` means: no hint. */
type WebPushHint =
  | 'none'
  | 'not_subscribed'
  | 'unsupported'
  | 'denied'
  | 'not_configured'
  | 'not_registered'

/**
 * The cause of the hint. The state of the browser comes from the probe of
 * WP-M14-142, the state of the server from the configuration of the channel
 * and from the answer whether the server knows this device (WP-M14-144) — the
 * hint names the cause it found and stays silent while a question is open: a
 * statement about the browser that was never checked is a lie.
 */
function webPushHint(
  push: BrowserPush | null,
  serverConfigured: boolean | null,
  deviceKnown: boolean | null,
): WebPushHint {
  if (push === null || push.state === 'unknown') {
    return 'none'
  }

  if (push.state === 'subscribed') {
    return deviceKnown === false ? 'not_registered' : 'none'
  }

  if (push.state === 'unsupported') {
    return 'unsupported'
  }

  if (push.state === 'denied') {
    return 'denied'
  }

  return serverConfigured === false ? 'not_configured' : 'not_subscribed'
}

/**
 * The **readable text** of a task (`specs/10-notifications.md` §11.18,
 * ADR-0052): the interface composes it from the event type and the params of
 * the task — the API stores no translated text (§3.1). A task of a ticket names
 * the ticket, a task of the readiness the pool and the time.
 *
 * The text says what happened — nothing about the way the message travelled:
 * the channel and the delivery state belong to the protocol of the
 * administration (§11.16).
 */
function taskText(t: TFunction<'common'>, item: NotificationItem): string {
  const params = item.params
  const ticket = item.ticketNo ?? ''
  const object = typeof params.objectName === 'string' ? params.objectName : ''
  const pool = typeof params.poolName === 'string' ? params.poolName : ''

  switch (item.eventType) {
    case 'ticket.assigned':
      return t('inbox.task.assigned', { ticket, object })
    case 'ticket.assignment_answered': {
      const answer =
        params.answer === 'accepted' ? t('inbox.task.accepted') : t('inbox.task.declined')
      const who = typeof params.assigneeName === 'string' ? params.assigneeName : ''

      return t('inbox.task.answered', { ticket, who, answer })
    }
    case 'ticket.escalated':
      return t('inbox.task.escalated', { ticket, object })
    case 'ticket.resolved':
      return t('inbox.task.resolved', { ticket, object })
    case 'oncall.assigned':
      return t('inbox.task.oncallAssigned', { pool })
    case 'oncall.swap_requested':
      return t('inbox.task.swapRequested', { pool })
    case 'oncall.unconfirmed_reminder':
      return t('inbox.task.unconfirmed', { pool })
    case 'oncall.released': {
      // The release of a shift (`ADR-0058`): the duty of the technician is
      // gone — the shift was deleted or handed over to another technician.
      const cause =
        params.release === 'reassigned'
          ? t('inbox.task.releasedReassigned')
          : t('inbox.task.releasedDeleted')

      return t('inbox.task.oncallReleased', { pool, cause })
    }
    case 'notification.delivery_failed': {
      const channel = typeof params.channel === 'string' ? params.channel : ''
      const code = typeof params.code === 'string' ? params.code : ''

      return t('inbox.task.deliveryFailed', {
        channel: t(`inbox.channels.${channel}`),
        code,
      })
    }
    default:
      return t('inbox.task.unknown', { ticket })
  }
}

/**
 * The inbox of the user (`specs/10-notifications.md` §11.18, ADR-0052): the
 * **tasks** of StörDesk to him — one entry per task, with the readable text of
 * the event, the link into the ticket or into the readiness and the time of
 * the task.
 *
 * The page names no channel and no delivery state: the way a message travelled
 * belongs to the protocol of the administration (§11.16), and the page of the
 * delivery carries it. A user with three confirmed channels sees **one** entry
 * and not three — the task is one thing to do, not three deliveries.
 *
 * The page never shows a contact of a reporter and never a photo (§11.5): the
 * title of a task is the ticket number or the name of the pool, the text names
 * the event.
 *
 * While this browser receives no push message the page names the cause and
 * the setup page of the settings menu (WP-M14-128, WP-M14-143) — it only links
 * there, registering this browser stays the card of WP-M14-126a. The hint sits
 * at the top of the page, right under the heading, so a channel problem is
 * never below the fold; a server without VAPID keys names its message itself
 * as the link to the setup guide at `/help/web-push`.
 */
export function InboxPage() {
  const { t, i18n } = useTranslation('common')
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [limit, setLimit] = useState(50)
  const [acknowledging, setAcknowledging] = useState<ReadonlySet<string>>(new Set())

  // The filter of the own inbox: only the unhandled tasks. The URL is the
  // source of the filter, so a filtered view can be shared.
  const unread = searchParams.get('unread') === 'true'

  function updateFilter(key: string, value: string, active: boolean) {
    const next = new URLSearchParams(searchParams)

    if (value === '' || !active) {
      next.delete(key)
    } else {
      next.set(key, value)
    }

    setSearchParams(next)
  }

  const query = new URLSearchParams({ limit: String(limit) })

  if (unread) query.set('unread', 'true')

  const items = useQuery({
    queryKey: ['notification-items', limit, unread],
    queryFn: () =>
      apiFetch<NotificationItemListResponse>(`/v1/notifications/items?${query.toString()}`),
    // An alarm must appear without a reload: the inbox asks again every half
    // minute, like the bell of the shell.
    refetchInterval: 30_000,
    retry: false,
  })

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; readAt: string | null }>(`/v1/notifications/items/${id}/read`, {
        method: 'PATCH',
      }),
    // Every row keeps its own pending state, so a slow receipt for one task
    // never blocks the quittature of the next one — an alarm is quit quickly.
    onMutate: (id: string) => {
      setAcknowledging((previous) => new Set(previous).add(id))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-items'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] })
    },
    onSettled: (_data, _error, id: string) => {
      setAcknowledging((previous) => {
        const next = new Set(previous)
        next.delete(id)

        return next
      })
    },
  })

  // The office asked: an inbox whose browser receives no push message names the
  // way there (WP-M14-128). The card of WP-M14-126a on `/settings/notifications`
  // owns the subscribe action; the inbox only links to it. The question goes to
  // the browser itself (WP-M14-142) and to the configuration of the channel —
  // a pending or failed question shows no hint, the inbox never blocks on the
  // state of the channel.
  const { push } = useBrowserPush()

  const webPush = useQuery({
    queryKey: ['webpush-config'],
    queryFn: () => apiFetch<WebPushConfigResponse>('/v1/notifications/accounts/webpush'),
    retry: false,
  })

  const serverConfigured = webPush.isSuccess ? (webPush.data?.publicKey ?? '') !== '' : null

  // Does the server know the device of this browser? The browser knows its own
  // subscription, the server knows its rows — only both together say whether a
  // push message can arrive (WP-M14-144). The endpoint travels in the body and
  // never in the answer.
  const device = useQuery({
    queryKey: ['webpush-device', push?.endpoint ?? ''],
    queryFn: () =>
      apiFetch<WebPushSubscriptionCheckResponse>('/v1/notifications/accounts/webpush/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: push?.endpoint }),
      }),
    enabled: push !== null && push.endpoint !== null,
    retry: false,
  })

  const deviceKnown =
    device.isSuccess && typeof device.data.registered === 'boolean' ? device.data.registered : null

  const hint = webPushHint(push, serverConfigured, deviceKnown)

  const hintTexts = {
    not_subscribed: t('inbox.webpush.hint'),
    unsupported: t('inbox.webpush.unsupported'),
    denied: t('inbox.webpush.denied'),
    not_configured: t('inbox.webpush.notConfigured'),
    not_registered: t('inbox.webpush.notRegistered'),
  }

  /** The time of the task in the language of the interface, not the browser. */
  const timeOf = (value: string): string =>
    new Date(value).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })

  /** The link of the task: into the ticket or into the readiness. */
  const linkOf = (item: NotificationItem): string | null => {
    if (item.ticketNo !== null && item.ticketNo !== '') {
      return `/tickets/${encodeURIComponent(item.ticketNo)}`
    }

    if (item.shiftId !== null && item.shiftId !== '') {
      return '/oncall'
    }

    return null
  }

  const tasks = items.data?.items ?? []

  return (
    <AdminLayout className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t('inbox.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('inbox.hint')}</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
          to="/"
        >
          {t('back')}
        </Link>
      </div>

      {hint !== 'none' ? (
        <p className="mt-4 flex flex-col gap-1">
          {hint === 'not_configured' ? (
            <Link
              className="text-sm text-amber-400 underline hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              to="/help/web-push"
            >
              {hintTexts[hint]}
            </Link>
          ) : (
            <span className="text-sm text-slate-400">{hintTexts[hint]}</span>
          )}
          <Link
            className="mt-1 inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-3 text-sm text-sky-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            to="/settings/notifications"
          >
            {t('inbox.webpush.setup')}
          </Link>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex w-fit items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm">
          <input
            checked={unread}
            onChange={(event) => updateFilter('unread', 'true', event.target.checked)}
            type="checkbox"
          />
          {t('inbox.filter.unreadOnly')}
        </label>

        <span className="flex items-center gap-2">
          <span className="text-sm text-slate-400">{t('inbox.limitLabel')}</span>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {[10, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </span>
      </div>

      {markRead.isError ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {t('inbox.acknowledgeError')}
        </p>
      ) : null}

      {items.isPending ? <p className="mt-4 text-slate-400">{t('auth.loading')}</p> : null}

      {items.isError ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {t('inbox.error')}
        </p>
      ) : null}

      {items.isSuccess && tasks.length === 0 ? (
        <p className="mt-4 text-slate-400">{t('inbox.empty')}</p>
      ) : null}

      {items.isSuccess && tasks.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {tasks.map((item) => {
            const link = linkOf(item)
            const pending = acknowledging.has(item.id)
            const text = taskText(t, item)

            return (
              <li
                className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                  item.readAt === null
                    ? 'border-slate-700 bg-slate-900/60 ring-1 ring-sky-500/30'
                    : 'border-slate-800 bg-slate-900/30'
                }`}
                key={item.id}
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  {link === null ? (
                    <span className="font-medium text-slate-100">{text}</span>
                  ) : (
                    <Link
                      className="font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-2 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      to={link}
                    >
                      {text}
                    </Link>
                  )}
                  <span className="text-xs text-slate-400">{timeOf(item.createdAt)}</span>
                  {item.readAt === null ? (
                    <span className="text-xs text-sky-300">{t('inbox.unread')}</span>
                  ) : null}
                </span>

                {item.readAt === null ? (
                  <button
                    className="mt-1 inline-flex min-h-11 items-center self-start rounded-lg border border-sky-600/60 px-3 text-sm text-sky-200 hover:bg-sky-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-progress disabled:opacity-60"
                    disabled={pending}
                    onClick={() => markRead.mutate(item.id)}
                    type="button"
                  >
                    {t('inbox.acknowledge')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </AdminLayout>
  )
}
