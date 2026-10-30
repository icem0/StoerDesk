import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { LoginForm, LogoutButton } from './auth/login-form'
import { useMe } from './auth/usePermission'

export function App() {
  const { t } = useTranslation('common')
  const me = useMe()

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
      {me.isPending ? <p className="mt-2 text-slate-400">{t('auth.loading')}</p> : null}
      {me.isError ? <LoginForm /> : null}
      {me.data ? (
        <section className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-slate-400">
            {t('auth.signedInAs', { email: me.data.user.email })}
          </p>
          <nav className="flex gap-2 text-sm">
            <Link className="underline" to="/admin/users">
              {t('auth.links.users')}
            </Link>
            <Link className="underline" to="/admin/roles">
              {t('auth.links.roles')}
            </Link>
          </nav>
          <LogoutButton />
        </section>
      ) : null}
    </main>
  )
}
