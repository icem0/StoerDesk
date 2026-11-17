import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type {
  NotificationMessageItem,
  NotificationMessageListResponse,
} from '@stoerdesk/shared'

import { apiFetch } from '../lib/api'

/**
 * The bell of the header (WP-M14-120e, WP-M14-122): it shows the number of the
 * unread messages and opens the panel with the latest messages of the inbox —
 * the internal layer of WP-M14-120 between the application and the external
 * channels. A click on a message marks it as read without leaving the panel;
 * the full inbox waits behind the link at the bottom.
 *
 * The count comes from `GET /api/v1/notifications/messages/unread-count` and is
 * refetched when the window regains the focus, so a message that arrives while
 * the application is open shows up without a reload.
 */
export function NotificationBell() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement | null>(null)

  const unread = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/v1/notifications/messages/unread-count'),
    refetchOnWindowFocus: true,
    retry: false,
  })

  const messages = useQuery({
    queryKey: ['notification-messages', 'bell'],
    queryFn: () => apiFetch<NotificationMessageListResponse>('/v1/notifications/messages?limit=5'),
    enabled: open,
    retry: false,
  })

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; readAt: string | null }>(
        `/v1/notifications/messages/${id}/read`,
        { method: 'PATCH' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-messages'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] })
    },
  })

  // The panel closes when the click lands outside of it or when the escape key
  // is pressed — a bell that stays open over the page blocks the work.
  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (container.current !== null && !container.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const count = unread.data?.count ?? 0
  const list = messages.data?.messages ?? []

  return (
    <div className="relative" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('app.inbox')}
        className={`relative flex h-11 w-11 items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          open
            ? 'border-sky-500/40 bg-sky-600/10 text-sky-300'
            : 'border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100'
        }`}
        onClick={() => setOpen((current) => !current)}
        title={t('app.inbox')}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white"
            data-testid="unread-count"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          aria-label={t('app.inbox')}
          className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl"
          role="dialog"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('inbox.title')}</h2>
            <span className="text-xs text-slate-400">
              {t('inbox.unreadCount', { count })}
            </span>
          </div>

          {messages.isPending ? (
            <p className="mt-2 text-xs text-slate-400">{t('auth.loading')}</p>
          ) : null}

          {messages.isError ? (
            <p className="mt-2 text-xs text-rose-400" role="alert">
              {t('inbox.error')}
            </p>
          ) : null}

          {messages.isSuccess && list.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">{t('inbox.empty')}</p>
          ) : null}

          <ul className="mt-2 flex flex-col gap-1">
            {list.map((message) => (
              <MessageEntry
                key={message.id}
                message={message}
                onRead={() => markRead.mutate(message.id)}
              />
            ))}
          </ul>

          <Link
            className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
            onClick={() => setOpen(false)}
            to="/notifications"
          >
            {t('inbox.showAll')}
          </Link>
        </div>
      ) : null}
    </div>
  )
}

/**
 * One message of the panel of the bell: the title, the channel, the state and
 * the moment of the message. An unread message is marked and a failed one
 * stands out; a click marks the message as read.
 */
function MessageEntry(props: {
  message: NotificationMessageItem
  onRead: () => void
}) {
  const { t } = useTranslation('common')
  const { message, onRead } = props

  return (
    <li>
      <button
        className={`flex w-full flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          message.state === 'FAILED'
            ? 'border-rose-800 bg-rose-950/30'
            : 'border-transparent'
        }`}
        onClick={onRead}
        type="button"
      >
        <span className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-medium text-slate-100">{message.title}</span>
          <span className="text-[11px] text-slate-400">
            {t(`inbox.channel.${message.channel}`)}
          </span>
          <span
            className={`text-[11px] ${
              message.state === 'FAILED' ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            {t(`inbox.state.${message.state.toLowerCase()}`)}
          </span>
          {message.readAt === null ? (
            <span className="text-[11px] text-sky-300">{t('inbox.unread')}</span>
          ) : null}
        </span>
        <span className="text-[11px] text-slate-500">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </button>
    </li>
  )
}
