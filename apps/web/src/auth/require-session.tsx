import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LoginForm } from './login-form'
import { useMe } from './usePermission'

/**
 * Route guard for the admin area (WP-M1-09e): pending `/me` shows the loading text, an
 * error (no session, expired session, deactivated account) shows the {@link LoginForm},
 * otherwise the children. It is cosmetic — the Fastify `requirePermission` guard stays
 * the only enforcement point (`specs/01-rbac.md` §3.2).
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const me = useMe()

  if (me.isPending) {
    return <p className="mt-4 text-slate-400">{t('auth.loading')}</p>
  }

  if (me.isError) {
    return <LoginForm />
  }

  return <>{children}</>
}
