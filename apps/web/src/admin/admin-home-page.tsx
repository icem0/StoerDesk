import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * Administration home (`PLAN.md` §14, WP-M2-24).
 *
 * The entry point of the administration area. It lists the administration
 * modules: the available ones link to their page, the ones whose phase has not
 * arrived yet are marked as planned with the phase they belong to, so the gaps
 * are visible instead of silently missing.
 */

type Module = {
  key: string
  to?: string
  phase?: string
}

const MODULES: Module[] = [
  { key: 'users', to: '/admin/users' },
  { key: 'roles', to: '/admin/roles' },
  { key: 'groups', phase: 'phase1' },
  { key: 'standardTexts', to: '/admin/text-templates' },
  { key: 'deadlines', phase: 'phase6' },
  { key: 'oncall', phase: 'phase8' },
  { key: 'channels', phase: 'phase7' },
  { key: 'apiKeys', phase: 'phase10' },
]

export function AdminHomePage() {
  const { t } = useTranslation('settings')

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('admin.home.title')}</h1>
        <p className="text-sm text-slate-400">{t('admin.home.hint')}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((module) => (
          <li key={module.key}>
            {module.to !== undefined ? (
              <Link
                className="block rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                to={module.to}
              >
                <span className="block text-sm font-semibold text-slate-100">
                  {t(`admin.home.modules.${module.key}.title`)}
                </span>
                <span className="mt-1 block text-sm text-slate-400">
                  {t(`admin.home.modules.${module.key}.hint`)}
                </span>
                <span className="mt-2 inline-flex rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  {t('admin.home.available')}
                </span>
              </Link>
            ) : (
              <div className="block rounded-xl border border-slate-800 bg-slate-900/30 p-4 opacity-70">
                <span className="block text-sm font-semibold text-slate-300">
                  {t(`admin.home.modules.${module.key}.title`)}
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  {t(`admin.home.modules.${module.key}.hint`)}
                </span>
                <span className="mt-2 inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                  {t('admin.home.planned', {
                    phase: t(`admin.home.phases.${module.phase ?? 'phase1'}`),
                  })}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
