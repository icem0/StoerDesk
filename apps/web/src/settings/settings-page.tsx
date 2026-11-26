import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AlarmSettings } from '@stoerdesk/shared'
import { useQuery } from '@tanstack/react-query'

import { LogoutButton } from '../auth/login-form'
import { useMe } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { isAlarmToneEnabled, playAlarmTone, setAlarmToneEnabled } from '../lib/alarm-tone'
import { SettingsMenu } from './settings-menu'

/**
 * Settings overview (WP-M12-07): every settings and administration surface in
 * one place, grouped by topic — single-column (WP-M29-03). The gear in the
 * shell header links here instead of opening a dropdown, so a page never hides
 * its destinations behind a menu. The administration home is gone
 * (WP-M14-01): the administration group links to four topic pages
 * (Benutzer & Rechte, Meldungsablauf, Bereitschaft, Kanäle & Versand) whose
 * links open the modules. The page carries **no** warning about a failed
 * delivery (ADR-0062): a failed delivery becomes a task in the mailbox of the
 * administration, and the problem stays listed on `/admin/delivery` — a badge
 * here would be a second warning that nobody has to look for.
 *
 * Since WP-M16-03 the links of the menu paint the accent colour of the instance
 * (ADR-0036): the menu of the presentation follows the colour the
 * administration saved under „Darstellung“, so a branded instance paints its
 * frame everywhere the shell and the settings menu are.
 *
 * The daily work surfaces (Meldungen, Statistik, „Neue Störung melden“) live in
 * the header menu, so they do not stand in this menu a second time; „Meine
 * Bereitschaft“ opens the same `/oncall` as the header entry and moves onto the
 * readiness topic page.
 */

const SETTINGS_SECTIONS = [
  {
    key: 'personal',
    items: [
      { key: 'mySettings', path: '/settings/me', icon: 'user' },
      { key: 'notifications', path: '/settings/notifications', icon: 'bell' },
      { key: 'myShifts', path: '/oncall', icon: 'clock' },
    ],
  },
  {
    key: 'appearance',
    items: [
      { key: 'branding', path: '/admin/branding', icon: 'palette' },
      { key: 'dashboardSettings', path: '/admin/dashboard', icon: 'monitor' },
    ],
  },
  {
    key: 'objects',
    items: [
      { key: 'objects', path: '/objects', icon: 'package' },
      { key: 'stickers', path: '/objects/stickers', icon: 'qr-code' },
      { key: 'stickerTemplate', path: '/admin/sticker-template', icon: 'printer' },
    ],
  },
  {
    key: 'administration',
    items: [
      { key: 'users', path: '/admin/users', icon: 'users' },
      { key: 'roles', path: '/admin/roles', icon: 'shield' },
      { key: 'groups', path: '/admin/groups', icon: 'group' },
      { key: 'statuses', path: '/admin/statuses', icon: 'tag' },
      { key: 'standardTexts', path: '/admin/text-templates', icon: 'file-text' },
      { key: 'detectedErrors', path: '/admin/detected-errors', icon: 'alert-triangle' },
      { key: 'escalation', path: '/admin/escalation', icon: 'trending-up' },
      { key: 'defaults', path: '/admin/defaults', icon: 'sliders' },
      { key: 'oncall', path: '/admin/oncall', icon: 'calendar' },
      { key: 'channels', path: '/admin/channels', icon: 'radio' },
      { key: 'delivery', path: '/admin/delivery', icon: 'alert-circle' },
      { key: 'email', path: '/admin/email', icon: 'mail' },
      { key: 'customers', path: '/admin/customers', icon: 'user' },
      { key: 'webhooks', path: '/admin/webhooks', icon: 'link' },
      { key: 'apiKeys', path: '/admin/api-keys', icon: 'key' },
      { key: 'bmaSync', path: '/admin/bma-sync', icon: 'refresh-cw' },
    ],
  },
] as const

export function SettingsPage() {
  const { t } = useTranslation('common')
  const [toneUnlocked, setToneUnlocked] = useState(isAlarmToneEnabled)
  const me = useMe()
  /**
   * The alarm of the installation (§11.17, ADR-0048): the settings page tells
   * the user that a browser only plays a tone after a gesture of the user — the
   * button below is that gesture.
   */
  const alarmQuery = useQuery({
    queryKey: ['notification-alarm'],
    queryFn: () => apiFetch<AlarmSettings>('/v1/notifications/alarm'),
    retry: false,
  })

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t('app.settings.title')}</h1>
        <p className="text-sm text-slate-400">{t('app.settingsHint')}</p>
        {me.data ? (
          <p className="mt-1 text-sm text-slate-400">
            {t('auth.signedInAs', { email: me.data.user.email })}
          </p>
        ) : null}
      </div>

      <SettingsMenu
        sections={SETTINGS_SECTIONS.map((section) => ({
          ...section,
          label: t(`app.settingsGroups.${section.key}`),
          items: section.items.map((item) => ({
            ...item,
            label: t(`app.settingsItems.${item.key}`),
            // The menu shows the **name only**; the explanation opens in the
            // panel of the ⓘ of the entry (`specs/13-ui.md` §14.13,
            // ADR-0060). The text lives in the namespace `help`.
            helpText: t(`help:settingsMenu.${item.key}More`),
          })),
        }))}
      />

      {alarmQuery.isSuccess && alarmQuery.data.toneEnabled && !toneUnlocked ? (
        <section className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold">{t('alarm.settings.heading')}</h2>
          <p className="text-sm text-slate-400">{t('alarm.settings.hint')}</p>
          <button
            className="min-h-11 w-fit rounded bg-sky-700 px-4 text-sm font-medium text-white"
            onClick={() => {
              setAlarmToneEnabled(true)
              setToneUnlocked(true)
              playAlarmTone()
            }}
            type="button"
          >
            {t('alarm.settings.activate')}
          </button>
        </section>
      ) : null}

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
