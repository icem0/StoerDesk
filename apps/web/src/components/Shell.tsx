import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { LoginForm, LogoutButton } from '../auth/login-form'
import { useMe } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { AppVersion } from './app-version'

import type { BrandingResponse } from '@stoerdesk/shared'

/**
 * System preference of the theme (WP-M2-92d): the setting `auto` follows
 * `prefers-color-scheme`, also when the preference changes while the app is open.
 */
function useSystemTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'dark'
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: light)')
    const listener = (event: MediaQueryListEvent) => setTheme(event.matches ? 'light' : 'dark')

    media.addEventListener('change', listener)

    return () => media.removeEventListener('change', listener)
  }, [])

  return theme
}

const navGroups = [
  {
    key: 'personal',
    items: [
      { key: 'mySettings', path: '/settings/me' },
      { key: 'myShifts', path: '/oncall' },
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
      { key: 'apiKeys', path: '/admin/api-keys' },
      { key: 'webhooks', path: '/admin/webhooks' },
      { key: 'bmaSync', path: '/admin/bma-sync' },
      { key: 'standardTexts', path: '/admin/text-templates' },
      { key: 'deadlines', path: '/admin/deadlines' },
      { key: 'oncall', path: '/admin/oncall' },
      { key: 'branding', path: '/admin/branding' },
      { key: 'dashboardSettings', path: '/admin/dashboard' },
    ],
  },
] as const

/**
 * Top-level entries of the header nav (WP-M2-28, WP-M10-35): the three pages the
 * internal user needs without opening the settings menu. `/` is matched exactly,
 * `/tickets` and `/oncall` by prefix, so a ticket detail keeps the `tickets`
 * entry and the readiness page its own entry active.
 */
const headerLinks = [
  { key: 'dashboard', path: '/' },
  { key: 'tickets', path: '/tickets' },
  { key: 'oncall', path: '/oncall' },
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
            <Link
              className="mt-1 block truncate text-sm text-sky-400 hover:text-sky-300"
              onClick={() => setOpen(false)}
              to="/settings/me"
            >
              {t('auth.signedInAs', { email })}
            </Link>
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
  const systemTheme = useSystemTheme()

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<BrandingResponse>('/v1/settings/branding'),
    retry: false,
  })

  const companyName = branding?.companyName ?? ''
  const title = companyName
    ? t('app.titleWithCompany', { company: companyName, product: t('app.title') })
    : t('app.title')

  // The theme of the user (WP-M2-92d): `auto` follows `prefers-color-scheme`, the
  // palette of the light mode lives in `styles.css` as Tailwind color variables.
  const theme = me.data?.user.theme ?? 'auto'
  const effectiveTheme = theme === 'auto' ? systemTheme : theme

  return (
    <div
      className={`theme-${effectiveTheme} flex min-h-dvh flex-col bg-slate-950 text-slate-100 print:bg-white`}
    >
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm print:hidden">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-6 sm:py-3">
          {/* Left (desktop): logo sits at the very left edge when there is enough space. */}
          <span className="order-1 flex min-w-0 items-center gap-2">
            <img
              alt={t('app.logoAlt')}
              className="h-8 w-auto shrink-0 rounded-lg sm:h-9"
              decoding="async"
              height="120"
              src="/logo.png"
              width="128"
            />
            <span className="hidden min-w-0 truncate font-semibold tracking-tight sm:block">
              {title}
            </span>
          </span>

          {/* Right: version and settings. On phones this stays in the first row. */}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0 sm:gap-3">
            <AppVersion className="whitespace-nowrap text-[11px] text-slate-500 sm:text-xs" />
            {me.data ? <SettingsMenu email={me.data.user.email} /> : null}
          </div>

          {/*
           * Single navigation element for both layouts (one DOM node, so no duplicate
           * links): on desktop it takes the middle of the header row and stays centred
           * between logo and actions; on phones it wraps onto its own row and scrolls
           * horizontally as a broad tab strip (44 px touch targets).
           */}
          <nav
            aria-label={t('app.navigation')}
            className="order-3 -mx-3 flex w-full items-center gap-1 overflow-x-auto px-3 pb-1 sm:order-2 sm:mx-0 sm:w-auto sm:flex-1 sm:justify-center sm:px-0 sm:pb-0"
          >
            {headerLinks.map((link) => (
              <NavLink
                end={link.path === '/'}
                className={({ isActive: routerActive }) => {
                  const active = routerActive

                  return `flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    active
                      ? 'bg-sky-600/10 text-sky-300'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }}
                key={link.key}
                to={link.path}
              >
                {t(`app.nav.${link.key}`)}
              </NavLink>
            ))}
          </nav>
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
