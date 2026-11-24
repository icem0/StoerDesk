import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { NotificationCompliance } from '@stoerdesk/shared'

import { apiFetch } from '../lib/api'

/**
 * The warning of the setup (`specs/10-notifications.md` §11.9, §11.17,
 * ADR-0045, ADR-0048): a user who does not fulfil the rule of the
 * administration carries a **large band on every internal page** — it names the
 * missing channels and links to the setup.
 *
 * The band has **no button that removes it**: a warning that can be clicked
 * away is no warning. It disappears when the rule is fulfilled — the query of
 * the shell and the query of the own page share the react-query cache, so the
 * confirmation of a channel (WP-M24-16) refreshes it everywhere.
 *
 * The names of the channels are the names of the kinds — never the address of
 * the user (§11.13).
 */
export function SetupWarningBand() {
  const { t } = useTranslation('common')

  const compliance = useQuery({
    queryKey: ['notification-compliance'],
    queryFn: () => apiFetch<NotificationCompliance>('/v1/notifications/compliance'),
    retry: false,
  })

  if (!compliance.isSuccess || compliance.data.compliant) {
    return null
  }

  const missing = compliance.data.missing

  return (
    <div
      aria-live="assertive"
      className="flex flex-col gap-2 border-b border-amber-400 bg-amber-950/80 px-4 py-4 text-amber-50 sm:px-6"
      data-testid="setup-warning-band"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full bg-amber-400/30 text-lg"
        >
          {t('setupWarning.icon')}
        </span>

        <span className="text-sm font-semibold sm:text-base">
          {t('setupWarning.heading')}
        </span>
      </div>

      <p className="text-sm">
        {t('setupWarning.missing', {
          channels: missing.map((kind) => t(`notifications.kinds.${kind}`)).join(', '),
          count: compliance.data.channelCount,
        })}
      </p>

      <Link
        className="text-sm font-medium text-amber-100 underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        to="/settings/notifications"
      >
        {t('setupWarning.link')}
      </Link>
    </div>
  )
}
