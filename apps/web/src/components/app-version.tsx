import { useTranslation } from 'react-i18next'

import { appVersion } from '../lib/version'

interface AppVersionProps {
  version?: string
  className?: string
}

/**
 * Shows the build version in the global shell (WP-M1-15), so it is visible on the
 * login screen and on every guarded page. The value comes from the build, never from
 * a runtime request.
 */
export function AppVersion({ version = appVersion, className }: AppVersionProps) {
  const { t } = useTranslation('common')

  return (
    <span className={className} data-testid="app-version">
      <span className="opacity-70">{t('app.version')}</span>{' '}
      <span className="font-medium">{version}</span>
    </span>
  )
}
