import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import type {
  NotificationMessageItem,
  NotificationMessageListResponse,
  WebPushConfigResponse,
  WebPushSubscriptionCheckResponse,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../../auth/usePermission'
import { apiFetch } from '../../lib/api'
import { type BrowserPush, useBrowserPush } from '../../lib/web-push'

const NOTIFICATION_CHANNELS = [
  'ntfy',
  'telegram',
  'matrix',
  'signal',
  'email',
  'webpush',
  'whatsapp',
] as const

const NOTIFICATION_EVENTS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.escalated',
  'ticket.resolved',
  'oncall.assigned',
  'oncall.swap_requested',
  'oncall.unconfirmed_reminder',
] as const

const NOTIFICATION_STATES = ['PENDING', 'SENT', 'FAILED'] as const

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
 * The inbox of the signed-in user (`specs/10-notifications.md` §11.8, §11.12,
 * WP-M14-120d): the messages that the internal layer recorded for the user
 * before they left to the external channels — which channel took a message,
 * whether it arrived and when. The newest message comes first; a click on a
 * message marks it as read.
 *
 * The page never shows a contact of a reporter and never a photo (§11.5): the
 * title is the ticket number or the name of the pool, the body carries the
 * machine-readable params of the message. While this browser receives no push
 * message the page names the cause and the setup page of the settings menu
 *  (WP-M14-128, WP-M14-143) — it only links there, registering this browser
 *  stays the card of WP-M14-126a. The hint sits at the top of the page, right
 *  under the heading, so a channel problem is never below the fold; a server
 *  without VAPID keys names its message itself as the link to the setup guide
 *  at `/help/web-push` (the guide carries the VAPID key generation, the
 *  `.env` entry and the restart of the API).
 *
 * The inbox of a user stays personal: the list shows the own messages only.
 * A role with the permission `notification.read_all` (WP-M14-141c) gets the
 * filter of §11.16 above the list — the addressee, the channel, the event, the
 * state of the delivery and the unread messages — and every row names its
 * addressee. The read receipt stays a right of the own messages.
 */
export function InboxPage() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [limit, setLimit] = useState(50)

  const me = useMe()
  const canReadAll = usePermission('notification.read_all')
  const ownUserId = me.data?.user?.id ?? ''

  // The URL is the source of the filter, so a filtered view can be shared
  // (§11.16).
  const userId = searchParams.get('userId') ?? ''
  const channel = searchParams.get('channel') ?? ''
  const eventType = searchParams.get('eventType') ?? ''
  const state = searchParams.get('state') ?? ''
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

  if (canReadAll) {
    if (userId !== '') query.set('userId', userId)
    if (channel !== '') query.set('channel', channel)
    if (eventType !== '') query.set('eventType', eventType)
    if (state !== '') query.set('state', state)
    if (unread) query.set('unread', 'true')
  }

  const messages = useQuery({
    queryKey: [
      'notification-messages',
      limit,
      canReadAll ? userId : '',
      canReadAll ? channel : '',
      canReadAll ? eventType : '',
      canReadAll ? state : '',
      canReadAll && unread,
    ],
    queryFn: () =>
      apiFetch<NotificationMessageListResponse>(
        `/v1/notifications/messages?${query.toString()}`,
      ),
    retry: false,
  })

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; readAt: string | null }>(`/v1/notifications/messages/${id}/read`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-messages'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] })
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

  const stateOf = (message: NotificationMessageItem) =>
    t(`inbox.state.${message.state.toLowerCase()}`)

  // The read receipt belongs to the own messages: a message of another user is
  // read by that user.
  const isOwn = (message: NotificationMessageItem) =>
    message.recipient === null || message.recipient.userId === ownUserId

  const recipients = messages.data?.recipients ?? []

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6">
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

      {canReadAll ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-700 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            {t('inbox.filter.recipient')}
            <select
              className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
              value={userId}
              onChange={(event) => updateFilter('userId', event.target.value, true)}
            >
              <option value="">{t('inbox.filter.recipientAll')}</option>
              {recipients.map((recipient) => (
                <option key={recipient.userId} value={recipient.userId}>
                  {recipient.name} ({recipient.count})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('inbox.filter.channel')}
            <select
              className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
              value={channel}
              onChange={(event) => updateFilter('channel', event.target.value, true)}
            >
              <option value="">{t('inbox.filter.channelAll')}</option>
              {NOTIFICATION_CHANNELS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`inbox.channel.${kind}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('inbox.filter.event')}
            <select
              className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
              value={eventType}
              onChange={(event) => updateFilter('eventType', event.target.value, true)}
            >
              <option value="">{t('inbox.filter.eventAll')}</option>
              {NOTIFICATION_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {t(`notifications.selection.events.${event}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {t('inbox.filter.state')}
            <select
              className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
              value={state}
              onChange={(event) => updateFilter('state', event.target.value, true)}
            >
              <option value="">{t('inbox.filter.stateAll')}</option>
              {NOTIFICATION_STATES.map((value) => (
                <option key={value} value={value}>
                  {t(`inbox.state.${value.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={unread}
              onChange={(event) => updateFilter('unread', 'true', event.target.checked)}
              type="checkbox"
            />
            {t('inbox.filter.unreadOnly')}
          </label>

          <button
            className="min-h-11 rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
            onClick={() => setSearchParams(new URLSearchParams())}
            type="button"
          >
            {t('inbox.filter.reset')}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm text-slate-400">{t('inbox.limitLabel')}</span>
        <select
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          {[10, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {messages.isPending ? <p className="mt-4 text-slate-400">{t('auth.loading')}</p> : null}

      {messages.isError ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {t('inbox.error')}
        </p>
      ) : null}

      {messages.isSuccess && messages.data.messages.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t('inbox.empty')}</p>
      ) : null}

      {messages.isSuccess && messages.data.messages.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {messages.data.messages.map((message) => {
            const body = (
              <>
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-slate-100">{message.title}</span>
                  {message.recipient === null ? null : (
                    <span className="text-xs text-slate-400">
                      {t('inbox.recipient')}: {message.recipient.name}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {t(`inbox.channel.${message.channel}`)}
                  </span>
                  <span
                    className={`text-xs ${
                      message.state === 'FAILED' ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {stateOf(message)}
                  </span>
                  {message.readAt === null ? (
                    <span className="text-xs text-sky-300">{t('inbox.unread')}</span>
                  ) : null}
                </span>
                <span className="text-xs text-slate-400">{message.body}</span>
                <span className="text-xs text-slate-500">
                  {new Date(message.createdAt).toLocaleString()}
                </span>
              </>
            )

            const rowClass = `flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              message.state === 'FAILED'
                ? 'border-rose-800 bg-rose-950/30'
                : 'border-slate-700 bg-slate-900/60'
            } ${message.readAt === null ? 'ring-1 ring-sky-500/30' : ''}`

            // A message of another user carries no read receipt for the admin.
            if (!isOwn(message)) {
              return (
                <li key={message.id}>
                  <div className={rowClass}>{body}</div>
                </li>
              )
            }

            return (
              <li key={message.id}>
                <button
                  className={rowClass}
                  disabled={markRead.isPending}
                  onClick={() => {
                    if (message.readAt === null) {
                      markRead.mutate(message.id)
                    }
                  }}
                  type="button"
                >
                  {body}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </main>
  )
}
