import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { LogoutButton } from '../auth/login-form'
import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { type ChannelStatusListResponse } from '@stoerdesk/shared'

/**
 * Settings overview (WP-M12-07): every settings and administration surface in
 * one place, grouped by topic. The gear in the shell header links here instead
 * of opening a dropdown, so a page never hides its destinations behind a menu.
 * The administration home is gone (WP-M14-01): the administration group lists
 * every module of the administration directly. A channel with failed rows in the
 * outbox is visible here as well (WP-M14-19, §11.8): a badge in the header names
 * the number of the failing channels until every channel works again — the
 * warning is not only the list on the channel page and the tile of the dashboard.
 */

const SETTINGS_SECTIONS = [
  {
    key: 'personal',
    items: [
      { key: 'mySettings', path: '/settings/me' },
      { key: 'notifications', path: '/settings/notifications' },
      { key: 'myShifts', path: '/oncall' },
    ],
  },
  {
    key: 'appearance',
    items: [
      { key: 'branding', path: '/admin/branding' },
      { key: 'dashboardSettings', path: '/admin/dashboard' },
    ],
  },
  {
    key: 'operations',
    items: [
      { key: 'tickets', path: '/tickets' },
      { key: 'ticketCreate', path: '/tickets/create' },
      { key: 'stats', path: '/stats' },
    ],
  },
  {
    key: 'objects',
    items: [
      { key: 'objects', path: '/objects' },
      { key: 'stickers', path: '/objects/stickers' },
    ],
  },
  {
    key: 'administration',
    items: [
      { key: 'users', path: '/admin/users' },
      { key: 'roles', path: '/admin/roles' },
      { key: 'groups', path: '/admin/groups' },
      { key: 'standardTexts', path: '/admin/text-templates' },
      { key: 'detectedErrors', path: '/admin/detected-errors' },
      { key: 'escalation', path: '/admin/escalation' },
      { key: 'oncall', path: '/admin/oncall' },
      { key: 'bmaSync', path: '/admin/bma-sync' },
      { key: 'apiKeys', path: '/admin/api-keys' },
      { key: 'channels', path: '/admin/channels' },
      { key: 'statuses', path: '/admin/statuses' },
      { key: 'webhooks', path: '/admin/webhooks' },
    ],
  },
] as const

export function SettingsPage() {
  const { t } = useTranslation('common')
  const me = useMe()
  const mayReadChannels = usePermission('notification.read')
  const statusQuery = useQuery({
    queryKey: ['channelStatus'],
    queryFn: () => apiFetch<ChannelStatusListResponse>('/v1/notifications/status'),
    enabled: mayReadChannels,
    retry: false,
  })
  const failingChannels = (statusQuery.data?.channels ?? []).filter((channel) => channel.failed > 0)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t('app.settings')}</h1>
        <p className="text-sm text-slate-400">{t('app.settingsHint')}</p>
        {me.data ? (
          <p className="mt-1 text-sm text-slate-400">
            {t('auth.signedInAs', { email: me.data.user.email })}
          </p>
        ) : null}
        {statusQuery.isSuccess && failingChannels.length > 0 ? (
          <p
            aria-live="polite"
            className="mt-1 rounded bg-rose-900/40 px-2 py-0.5 text-sm font-medium text-rose-300"
            role="alert"
          >
            {t('app.channelWarning.badge', { count: failingChannels.length })}
          </p>
        ) : null}
      </div>

      {SETTINGS_SECTIONS.map((section) => (
        <section className="flex flex-col gap-1" key={section.key}>
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t(`app.settingsGroups.${section.key}`)}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-xl border px-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      isActive
                        ? 'border-sky-500/40 bg-sky-600/10 text-sky-300'
                        : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:bg-slate-800/60'
                    }`
                  }
                  to={item.path}
                >
                  {t(`auth.links.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('app.settingsGroups.account')}
        </h2>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-2 [&>button]:min-h-11 [&>button]:w-full">
          <LogoutButton />
        </div>
      </section>
    </section>
  )
}
