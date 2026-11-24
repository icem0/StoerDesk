import { useTranslation } from 'react-i18next'

import { SettingsMenu } from '../settings/settings-menu'

/**
 * Übersichtsseite „Kanäle & Versand“ (specs/13-ui.md §14.11, WP-M29-04):
 * die Meldekanäle, die Zustellung, die Mailbox des Betriebs, die Webhooks,
 * die API-Schlüssel und der BMAcloud-Abgleich.
 */
export function MessagingPage() {
  const { t } = useTranslation('common')

  return (
    <div className="mt-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('app.settingsItems.messaging')}</h1>
      <p className="text-sm text-slate-400">{t('app.settingsItemDescriptions.messaging')}</p>
      <SettingsMenu
        sections={[
          {
            key: 'messaging',
            label: t('app.settingsItems.messaging'),
            items: [
              {
                key: 'channels',
                path: '/admin/channels',
                icon: 'radio',
                label: t('app.settingsItems.channels'),
                description: t('app.settingsItemDescriptions.channels'),
              },
              {
                key: 'delivery',
                path: '/admin/delivery',
                icon: 'alert-triangle',
                label: t('app.settingsItems.delivery'),
                description: t('app.settingsItemDescriptions.delivery'),
              },
              {
                key: 'email',
                path: '/admin/email',
                icon: 'mail',
                label: t('app.settingsItems.email'),
                description: t('app.settingsItemDescriptions.email'),
              },
              {
                key: 'webhooks',
                path: '/admin/webhooks',
                icon: 'link',
                label: t('app.settingsItems.webhooks'),
                description: t('app.settingsItemDescriptions.webhooks'),
              },
              {
                key: 'apiKeys',
                path: '/admin/api-keys',
                icon: 'key',
                label: t('app.settingsItems.apiKeys'),
                description: t('app.settingsItemDescriptions.apiKeys'),
              },
              {
                key: 'bmaSync',
                path: '/admin/bma-sync',
                icon: 'refresh-cw',
                label: t('app.settingsItems.bmaSync'),
                description: t('app.settingsItemDescriptions.bmaSync'),
              },
            ],
          },
        ]}
      />
    </div>
  )
}
