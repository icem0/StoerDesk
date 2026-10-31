import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { LoginForm, LogoutButton } from '../auth/login-form'
import { useMe } from '../auth/usePermission'
import { AppVersion } from './app-version'

const navItems = [
  { key: 'users', path: '/admin/users' },
  { key: 'roles', path: '/admin/roles' },
  { key: 'stickers', path: '/objects/stickers' },
] as const

export function Shell() {
  const { t } = useTranslation('common')
  const me = useMe()
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col print:bg-white">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-20 print:hidden">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-tight">{t('app.title')}</span>
          </div>
          <div className="flex items-center gap-3">
            <AppVersion className="text-xs text-slate-500" />
            {me.data ? (
              <>
                <span className="text-sm text-slate-400 hidden sm:block">
                  {t('auth.signedInAs', { email: me.data.user.email })}
                </span>
                <LogoutButton />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        {me.data ? (
          <nav className="w-64 border-r border-slate-800 bg-slate-900/50 flex-shrink-0 print:hidden">
            <ul className="p-3 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path
                const itemLabel =
                  item.key === 'users'
                    ? t('auth.links.users')
                    : item.key === 'roles'
                      ? t('auth.links.roles')
                      : t('auth.links.stickers')
                return (
                  <li key={item.key}>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                        active
                          ? 'bg-sky-600/10 text-sky-300 border border-sky-500/30'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                      }`}
                    >
                      {itemLabel}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        ) : null}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 print:overflow-visible print:p-0">
          <div className="max-w-3xl mx-auto print:max-w-none print:mx-0">
            {me.isPending ? <p className="mt-4 text-slate-400">{t('auth.loading')}</p> : null}
            {me.isError ? <LoginForm /> : null}
            {me.data ? <Outlet /> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
