import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UpdatePanel } from '../admin/update-panel'
import { usePermission } from '../auth/usePermission'
import { appVersion } from '../lib/version'

interface AppVersionProps {
  version?: string
  className?: string
}

/**
 * Shows the build version in the global shell (WP-M1-15), so it is visible on the
 * login screen and on every guarded page. The value comes from the build, never from
 * a runtime request.
 *
 * For a user with the permission `system.update` the badge is a button: it opens
 * the update menu of the administration (`specs/18-self-update.md` §18.2,
 * ADR-0007), which checks GitHub for a newer commit and starts the deployment.
 * Every other user keeps the plain text.
 */
export function AppVersion({ version = appVersion, className }: AppVersionProps) {
  const { t } = useTranslation('common')
  const mayUpdate = usePermission('system.update')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  const label = (
    <>
      <span className="opacity-70">{t('app.version')}</span>{' '}
      <span className="font-medium">{version}</span>
    </>
  )

  if (!mayUpdate) {
    return (
      <span className={className} data-testid="app-version">
        {label}
      </span>
    )
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${className ?? ''}`}
        data-testid="app-version"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        {label}
      </button>

      {open ? <UpdatePanel onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
