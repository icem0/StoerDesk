import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'

import { LoginForm } from '../auth/login-form'
import { useMe } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { AlarmBanner } from './alarm-banner'
import { SetupWarningBand } from './setup-warning-band'
import { AppVersion } from './app-version'
import { Icon, type IconName } from './icon'
import { NotificationBell } from './notification-bell'
import { PageHelp } from './page-help'

import type { BrandingResponse } from '@stoerdesk/shared'
import { DEFAULT_ACCENT_COLOR } from '@stoerdesk/shared'

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

/**
 * Top-level entries of the header nav (WP-M2-28, WP-M10-35): the three pages the
 * internal user needs without opening the settings page. The start page is the
 * ticket list; the statistics took the place of the retired dashboard. `/tickets`
 * and `/stats` are matched by prefix, so a ticket detail keeps the `tickets`
 * entry active and the readiness page its own entry. Since WP-M16-04 the inbox
 * follows these three as an entry of its own (`specs/13-ui.md` §14.5), so the
 * four surfaces the internal user opens every day live in one menu row.
 */
const headerLinks = [
  { key: 'tickets', path: '/tickets' },
  { key: 'stats', path: '/stats' },
  { key: 'oncall', path: '/oncall' },
] as const

const navIcons: Record<(typeof headerLinks)[number]['key'], IconName> = {
  tickets: 'ticket',
  stats: 'bar-chart',
  oncall: 'calendar',
} as const

/**
 * Settings access of the shell (WP-M1-17, WP-M12-08): the gear sits next to the
 * version and opens the settings overview page directly. There is no dropdown:
 * every destination lives on the settings page, grouped by topic.
 */
function SettingsLink() {
  const { t } = useTranslation('common')

  return (
    <NavLink
      aria-label={t('app.settings.title')}
      className={({ isActive }) =>
        `flex h-11 w-11 items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
          isActive
            ? 'border-accent-500/40 bg-accent-600/10 text-accent-300'
            : 'border-slate-700/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100'
        }`
      }
      to="/settings"
    >
      <Icon name="settings" className="h-5 w-5" />
    </NavLink>
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

  // The accent colour of the instance (ADR-0036, WP-M16-03): the value the
  // administration saved under „Darstellung“ is written into `--brand-accent` on
  // the shell root, the ramp `--color-accent-*` in `styles.css` derives from it
  // and the interface classes paint `*-accent-*`. The branding request above
  // already carries it, so this needs no request of its own.
  const accent = branding?.accentColor ?? DEFAULT_ACCENT_COLOR

  return (
    <div
      className={`theme-${effectiveTheme} flex min-h-dvh flex-col bg-slate-950 text-slate-100 print:bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`}
      style={{ '--brand-accent': accent } as CSSProperties}
    >

      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm print:hidden">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-6 sm:py-3">
          {/* Left (desktop): logo sits at the very left edge when there is enough space. */}
          <span className="order-1 flex min-w-0 items-center gap-2">
            <img
              alt={t('app.logoAlt')}
              className="h-7 w-auto shrink-0 rounded-lg sm:h-9"
              decoding="async"
              height="120"
              src="/logo.png"
              width="128"
            />
            <span className="hidden min-w-0 truncate font-semibold tracking-tight text-sm sm:block sm:text-base">
              {title}
            </span>
          </span>

          {/* Right: version, the explanation of the page and the settings. The
               bell is not here any more — since WP-M16-04 it is an entry of the
               menu below (specs/13-ui.md §14.5). */}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0 sm:gap-3">
            <AppVersion className="whitespace-nowrap text-[11px] text-slate-500 sm:text-xs" />
            {me.data ? <PageHelp /> : null}
            {me.data ? <SettingsLink /> : null}
          </div>

          {/*
           * Single navigation element for both layouts (one DOM node, so no
           * duplicate links): on desktop it takes the middle of the header row
           * and stays centred between logo and actions; on phones it wraps onto
           * its own row and scrolls horizontally as a broad tab strip (44 px
           * touch targets). Since WP-M16-04 the inbox is an entry of this menu
           * right after the readiness, so the four surfaces the internal user
           * opens every day live in one row (specs/13-ui.md §14.5).
           */}
          <nav
            aria-label={t('app.navigation')}
            className="shell-tab-strip order-3 -mx-4 flex w-full items-center gap-1 overscroll-y-none overflow-x-auto px-4 pb-1 sm:order-2 sm:-mx-0 sm:w-auto sm:flex-1 sm:justify-center sm:px-3 sm:pb-0"
          >
            {headerLinks.map((link) => (
              <NavLink
                className={({ isActive: routerActive }) => {
                  const active = routerActive

                  return `flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    active
                      ? 'bg-accent-600/10 text-accent-300'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }}
                key={link.key}
                to={link.path}
              >
                <Icon name={navIcons[link.key]} className="h-5 w-5 shrink-0" />
                {t(`app.nav.${link.key}`)}
              </NavLink>
            ))}
            {me.data ? <NotificationBell /> : null}
          </nav>
        </div>
      </header>

      {me.data ? <SetupWarningBand /> : null}
      {me.data ? <AlarmBanner /> : null}

      <main className="shell-main mx-auto w-full max-w-5xl flex-1 px-3 py-4 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-6 lg:py-8 print:max-w-none print:p-0">
        {me.isPending ? <p className="mt-4 text-slate-400">{t('auth.loading')}</p> : null}
        {me.isError ? <LoginForm /> : null}
        {me.data ? <Outlet /> : null}
      </main>
    </div>
  )
}
