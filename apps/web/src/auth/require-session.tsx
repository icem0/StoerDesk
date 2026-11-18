import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LoginForm } from './login-form'
import { PasswordChangeForm } from './password-change-form'
import { useMe } from './usePermission'

/**
 * Route guard for the admin area (WP-M1-09e): pending `/me` shows the loading text, an
 * error (no session, expired session, deactivated account) shows the {@link LoginForm},
 * otherwise the children. It is cosmetic — the Fastify `requirePermission` guard stays
 * the only enforcement point (`specs/01-rbac.md` §3.2).
 *
 * An account whose password is a one-time password sees the
 * {@link PasswordChangeForm} instead of the page: the server closes every
 * guarded route until the user sets a password of their own
 * (`specs/01-rbac.md` §3.9, ADR-0031).
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

  if (me.data?.user.mustChangePassword === true) {
    return <PasswordChangeForm />
  }

  return <>{children}</>
}
