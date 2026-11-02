import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { LoginForm, LogoutButton } from '../auth/login-form'
import { useMe } from '../auth/usePermission'
import { AppVersion } from './app-version'

const navGroups = [
  {
    key: 'operations',
    items: [
      { key: 'tickets', path: '/tickets' },
      { key: 'ticketCreate', path: '/tickets/create' },
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
    ],
  },
] as const

function SettingsIcon() {
  return (
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/**
 * Settings access of the shell (WP-M1-17): the gear sits next to the version, so the
 * navigation needs no permanent sidebar and the content keeps the full phone width.
 * Every label reuses an existing `common` key except `app.settings`.
 */
function SettingsMenu({ email }: { email: string }) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('app.settings')}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700/80 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        onClick={() => setOpen((current) => !current)}
        title={t('app.settings')}
        type="button"
      >
        <SettingsIcon />
      </button>

      {open ? (
        <div
          aria-label={t('app.settings')}
          className="absolute right-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          id={menuId}
          role="dialog"
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('app.settings')}
            </p>
            <p className="mt-1 truncate text-sm text-slate-300">
              {t('auth.signedInAs', { email })}
            </p>
          </div>

          {navGroups.map((group) => (
            <div
              className="border-b border-slate-800 p-2 last:border-b-0"
              key={group.key}
              role="group"
            >
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t(`app.settingsGroups.${group.key}`)}
              </p>
              <ul>
                {group.items.map((item) => {
                  const active = location.pathname === item.path

                  return (
                    <li key={item.key}>
                      <Link
                        className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
                          active
                            ? 'bg-sky-600/10 text-sky-300'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                        onClick={() => setOpen(false)}
                        to={item.path}
                      >
                        {t(`auth.links.${item.key}`)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          <div className="border-t border-slate-800 p-2 [&>button]:min-h-11 [&>button]:w-full">
            <LogoutButton />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function Shell() {
  const { t } = useTranslation('common')
  const me = useMe()

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100 print:bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-3">
          <span className="min-w-0 truncate font-semibold tracking-tight">{t('app.title')}</span>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <AppVersion className="whitespace-nowrap text-[11px] text-slate-500 sm:text-xs" />
            {me.data ? <SettingsMenu email={me.data.user.email} /> : null}
          </div>
        </div>
      </header>

      <main className="shell-main mx-auto w-full max-w-5xl flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:py-8 print:max-w-none print:p-0">
        {me.isPending ? <p className="mt-4 text-slate-400">{t('auth.loading')}</p> : null}
        {me.isError ? <LoginForm /> : null}
        {me.data ? <Outlet /> : null}
      </main>
    </div>
  )
}
