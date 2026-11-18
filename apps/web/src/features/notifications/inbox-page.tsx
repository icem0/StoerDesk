import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type {
  NotificationMessageItem,
  NotificationMessageListResponse,
} from '@stoerdesk/shared'

import { apiFetch } from '../../lib/api'

/**
 * The inbox of the signed-in user (`specs/10-notifications.md` §11.8, §11.12,
 * WP-M14-120d): the messages that the internal layer recorded for the user
 * before they left to the external channels — which channel took a message,
 * whether it arrived and when. The newest message comes first; a click on a
 * message marks it as read.
 *
 * The page never shows a contact of a reporter and never a photo (§11.5): the
 * title is the ticket number or the name of the pool, the body carries the
 * machine-readable params of the message.
 */
export function InboxPage() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()

  const [limit, setLimit] = useState(50)

  const messages = useQuery({
    queryKey: ['notification-messages', limit],
    queryFn: () =>
      apiFetch<NotificationMessageListResponse>(`/v1/notifications/messages?limit=${limit}`),
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

  const stateOf = (message: NotificationMessageItem) =>
    t(`inbox.state.${message.state.toLowerCase()}`)

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

      {messages.isPending ? (
        <p className="mt-4 text-slate-400">{t('auth.loading')}</p>
      ) : null}

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
          {messages.data.messages.map((message) => (
            <li key={message.id}>
              <button
                className={`flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  message.state === 'FAILED'
                    ? 'border-rose-800 bg-rose-950/30'
                    : 'border-slate-700 bg-slate-900/60'
                } ${message.readAt === null ? 'ring-1 ring-sky-500/30' : ''}`}
                disabled={markRead.isPending}
                onClick={() => {
                  if (message.readAt === null) {
                    markRead.mutate(message.id)
                  }
                }}
                type="button"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-slate-100">{message.title}</span>
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
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
