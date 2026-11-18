import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { apiFetch } from '../lib/api'

/**
 * The bell of the header (WP-M14-120e, WP-M14-122, WP-M14-127): the badge of
 * the unread messages and one click that opens the inbox page
 * `/notifications`. The office asked for the page itself — the panel of
 * WP-M14-122 that repeated the latest messages inside the header is gone, so a
 * message is marked as read on the inbox page of WP-M14-120d only.
 *
 * The count comes from `GET /api/v1/notifications/messages/unread-count` and is
 * refetched when the window regains the focus, so a message that arrives while
 * the application is open shows up on the badge without a reload.
 */
export function NotificationBell() {
  const { t } = useTranslation('common')

  const unread = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/v1/notifications/messages/unread-count'),
    refetchOnWindowFocus: true,
    retry: false,
  })

  const count = unread.data?.count ?? 0

  return (
    <Link
      aria-label={t('app.inbox')}
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        count > 0
          ? 'border-sky-500/40 bg-sky-600/10 text-sky-300'
          : 'border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100'
      }`}
      title={t('app.inbox')}
      to="/notifications"
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
    </Link>
  )
}
