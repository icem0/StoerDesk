import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * The page for an address that does not exist (`specs/13-ui.md`, WP-M3-13).
 *
 * The router has a catch-all route, so an unknown address never reaches the
 * error boundary of React Router: the user sees a page of this application
 * with a link back to the dashboard instead of the raw developer page.
 */
export function NotFoundPage() {
  const { t } = useTranslation('common')

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('app.notFound.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('app.notFound.hint')}</p>
      </div>

      <Link
        className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/"
      >
        {t('app.notFound.back')}
      </Link>
    </section>
  )
}
