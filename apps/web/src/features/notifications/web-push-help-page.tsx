import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * The setup guide for Web Push (VAPID) at `/help/web-push`. The inbox names a
 * server without VAPID keys and links its message to this page, so the
 * missing configuration is never a dead end: the page is the `docs/VAPID-SETUP.md`
 * mirrored into the app — why the channel is off, how to generate a key pair
 * (`npx web-push generate-vapid-keys`), where the values belong (the local
 * `.env`) and what comes up afterwards. No secret is shown and nothing is
 * fetched: the page is static text with the two links to the notification
 * settings and back to the inbox.
 */
export function WebPushHelpPage() {
  const { t } = useTranslation('common')

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('help.webpush.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('help.webpush.hint')}</p>
      </div>

      <ul className="mt-4 flex flex-col gap-1 text-sm">
        <li>{t('help.webpush.publicKey')}</li>
        <li>{t('help.webpush.privateKey')}</li>
        <li>{t('help.webpush.subject')}</li>
      </ul>

      <p className="mt-2 text-sm text-slate-300">{t('help.webpush.why')}</p>

      <div className="mt-6 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('help.webpush.generateTitle')}</h2>
        <p className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-slate-950 px-2 py-1 font-mono text-sky-300">
            {t('help.webpush.command')}
          </code>
        </p>
        <p className="text-sm text-slate-300">{t('help.webpush.generateHint')}</p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('help.webpush.envTitle')}</h2>
        <p className="text-sm text-slate-300">{t('help.webpush.envHint')}</p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('help.webpush.restartTitle')}</h2>
        <p className="text-sm text-slate-300">{t('help.webpush.restartHint')}</p>
      </div>

      <p className="mt-4 text-sm text-amber-400">{t('help.webpush.secret')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-3 text-sm text-sky-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/settings/notifications"
        >
          {t('help.webpush.settingsLink')}
        </Link>

        <Link
          className="ml-2 inline-flex min-h-11 items-center rounded bg-slate-800 px-3 text-sm hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/notifications"
        >
          {t('help.webpush.inboxLink')}
        </Link>
      </div>
    </main>
  )
}
