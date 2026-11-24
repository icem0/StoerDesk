import { useTranslation } from 'react-i18next'

import { SettingsMenu } from '../settings/settings-menu'

/**
 * Übersichtsseite „Meldungsablauf“ (specs/13-ui.md §14.11, WP-M29-04):
 * die Status, die Störungsarten, die Eskalation, die Standardwerte und die
 * festgestellten Fehler der Meldungen.
 */
export function WorkflowPage() {
  const { t } = useTranslation('common')

  return (
    <div className="mt-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('app.settingsItems.workflow')}</h1>
      <p className="text-sm text-slate-400">{t('app.settingsItemDescriptions.workflow')}</p>
      <SettingsMenu
        sections={[
          {
            key: 'workflow',
            label: t('app.settingsItems.workflow'),
            items: [
              {
                key: 'statuses',
                path: '/admin/statuses',
                icon: 'tag',
                label: t('app.settingsItems.statuses'),
                description: t('app.settingsItemDescriptions.statuses'),
              },
              {
                key: 'standardTexts',
                path: '/admin/text-templates',
                icon: 'file-text',
                label: t('app.settingsItems.standardTexts'),
                description: t('app.settingsItemDescriptions.standardTexts'),
              },
              {
                key: 'detectedErrors',
                path: '/admin/detected-errors',
                icon: 'alert-triangle',
                label: t('app.settingsItems.detectedErrors'),
                description: t('app.settingsItemDescriptions.detectedErrors'),
              },
              {
                key: 'escalation',
                path: '/admin/escalation',
                icon: 'alert-circle',
                label: t('app.settingsItems.escalation'),
                description: t('app.settingsItemDescriptions.escalation'),
              },
              {
                key: 'defaults',
                path: '/admin/defaults',
                icon: 'sliders',
                label: t('app.settingsItems.defaults'),
                description: t('app.settingsItemDescriptions.defaults'),
              },
            ],
          },
        ]}
      />
    </div>
  )
}
