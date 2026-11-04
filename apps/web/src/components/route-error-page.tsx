import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/**
 * The error boundary of the router (`specs/13-ui.md`, WP-M3-13).
 *
 * React Router renders its own developer page ("Unexpected Application
 * Error!") for an error of a route — an unknown address, a broken render, a
 * failed loader. This component replaces it with a page of this application:
 * the reason is named in the user's language, the technical detail stays in
 * the log of the browser and the user can go back to the dashboard.
 */
export function RouteErrorPage() {
  const { t } = useTranslation('common')
  const error = useRouteError()

  // A 404 of the router is a missing address, everything else is a failure.
  const missing = isRouteErrorResponse(error) && error.status === 404 ? 'notFound' : 'failed'

  return (
    // The error element replaces the shell of the application, so the page
    // brings its own frame.
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t(`app.error.${missing}.title`)}</h1>
          <p className="mt-1 text-sm text-slate-400">{t(`app.error.${missing}.hint`)}</p>
        </div>

        <a
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          href="/"
        >
          {t('app.error.back')}
        </a>
      </section>
    </main>
  )
}
