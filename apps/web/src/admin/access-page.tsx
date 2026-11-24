import { useTranslation } from 'react-i18next'

import { SettingsMenu } from '../settings/settings-menu'

/**
 * Übersichtsseite „Benutzer & Rechte“ (specs/13-ui.md §14.11, WP-M29-04):
 * die Benutzer, die Rollen und die Gruppen der Instanz.
 * Die Seiten der Zielmodule tragen ihre eigenen Berechtigungen.
 */
export function AccessPage() {
  const { t } = useTranslation('common')

  return (
    <div className="mt-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('app.settingsItems.access')}</h1>
      <p className="text-sm text-slate-400">{t('app.settingsItemDescriptions.access')}</p>
      <SettingsMenu
        sections={[
          {
            key: 'access',
            label: t('app.settingsItems.access'),
            items: [
              {
                key: 'users',
                path: '/admin/users',
                icon: 'users',
                label: t('app.settingsItems.users'),
                description: t('app.settingsItemDescriptions.users'),
              },
              {
                key: 'roles',
                path: '/admin/roles',
                icon: 'shield',
                label: t('app.settingsItems.roles'),
                description: t('app.settingsItemDescriptions.roles'),
              },
              {
                key: 'groups',
                path: '/admin/groups',
                icon: 'group',
                label: t('app.settingsItems.groups'),
                description: t('app.settingsItemDescriptions.groups'),
              },
            ],
          },
        ]}
      />
    </div>
  )
}
