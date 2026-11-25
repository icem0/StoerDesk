import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { HelpPopover } from './help-popover'
import { pageHelpKey } from './page-help-map'

/**
 * The ⓘ of the page (`specs/13-ui.md` §14.13, ADR-0060).
 *
 * It stands in the header of the shell, next to the version: every guarded
 * page carries **one** symbol that names the page in a panel. A page that
 * explains itself carries none (`page-help-map.ts`).
 */
export function PageHelp() {
  const location = useLocation()
  const { t } = useTranslation('help')
  const key = pageHelpKey(location.pathname)

  if (key === null) {
    return null
  }

  return (
    <HelpPopover
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      text={t(key)}
    />
  )
}
