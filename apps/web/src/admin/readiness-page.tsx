import { useTranslation } from 'react-i18next'

import { SettingsMenu } from '../settings/settings-menu'

/**
 * Übersichtsseite „Bereitschaft“ (specs/13-ui.md §14.11, WP-M29-04):
 * der Bereitschaftsplan der Instanz und die eigene Bereitschaft des
 * angemeldeten Benutzers.
 */
export function ReadinessPage() {
  const { t } = useTranslation('common')

  return (
    <div className="mt-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('app.settingsItems.readiness')}</h1>
      <p className="text-sm text-slate-400">{t('app.settingsItemDescriptions.readiness')}</p>
      <SettingsMenu
        sections={[
          {
            key: 'readiness',
            label: t('app.settingsItems.readiness'),
            items: [
              {
                key: 'oncall',
                path: '/admin/oncall',
                icon: 'calendar',
                label: t('app.settingsItems.oncall'),
                description: t('app.settingsItemDescriptions.oncall'),
              },
              {
                key: 'myShifts',
                path: '/oncall',
                icon: 'user',
                label: t('app.settingsItems.myShifts'),
                description: t('app.settingsItemDescriptions.myShifts'),
              },
            ],
          },
        ]}
      />
    </div>
  )
}
