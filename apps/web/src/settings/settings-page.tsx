import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { LogoutButton } from '../auth/login-form'
import { useMe } from '../auth/usePermission'

/**
 * Settings overview (WP-M12-07): every settings and administration surface in
 * one place, grouped by topic. The gear in the shell header links here instead
 * of opening a dropdown, so a page never hides its destinations behind a menu.
 */

const SETTINGS_SECTIONS = [
  {
    key: 'personal',
    items: [
      { key: 'mySettings', path: '/settings/me' },
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
      { key: 'admin', path: '/admin' },
      { key: 'users', path: '/admin/users' },
      { key: 'roles', path: '/admin/roles' },
      { key: 'groups', path: '/admin/groups' },
      { key: 'standardTexts', path: '/admin/text-templates' },
      { key: 'detectedErrors', path: '/admin/detected-errors' },
      { key: 'deadlines', path: '/admin/deadlines' },
      { key: 'escalationStages', path: '/admin/escalation-stages' },
      { key: 'oncall', path: '/admin/oncall' },
      { key: 'bmaSync', path: '/admin/bma-sync' },
      { key: 'apiKeys', path: '/admin/api-keys' },
      { key: 'webhooks', path: '/admin/webhooks' },
    ],
  },
] as const

export function SettingsPage() {
  const { t } = useTranslation('common')
  const me = useMe()

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
