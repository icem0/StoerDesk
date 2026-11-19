import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * The setup guide for Web Push (VAPID) at `/help/web-push`. The inbox names a
 * server without VAPID keys and links its message to this page, so the
 * missing configuration is never a dead end: the page is the `docs/VAPID-SETUP.md`
 * mirrored into the app — why the channel is off, how to generate a key pair
 * (`npx web-push generate-vapid-keys`), where the values belong (the local
 * `.env`) and what comes up afterwards. The generate command sits in its own
 * code field with a copy button, so a user who does not know the command can
 * copy it as it is; the second code field holds the command of the Docker
 * stack (`docker compose exec api npx web-push generate-vapid-keys`), because
 * the web container of the stack is nginx and has no Node. The hint names
 * where the command runs. No secret is shown and nothing is fetched: the page
 * is static text with the copy actions and the two links to the notification
 * settings and back to the inbox.
 */
function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="1.5" ry="1.5" width="10" x="3" y="3" />
      <rect height="12" rx="1.5" ry="1.5" width="10" x="11" y="9" />
    </svg>
  )
}

export function WebPushHelpPage() {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState<string | null>(null)
  const commands = [
    { id: 'host', label: t('help.webpush.commandHostLabel'), command: t('help.webpush.command') },
    {
      id: 'docker',
      label: t('help.webpush.commandDockerLabel'),
      command: t('help.webpush.commandDocker'),
    },
  ]

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
        <p className="text-sm text-slate-300">{t('help.webpush.generateHint')}</p>
        <div className="flex flex-col gap-3">
          {commands.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">{entry.label}</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-950 px-2 py-1 font-mono text-sky-300">
                  {entry.command}
                </code>
                <button
                  aria-label={t('help.webpush.copyToClipboardCommand', { label: entry.label })}
                  className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  onClick={() => {
                    void navigator.clipboard.writeText(entry.command).then(() => {
                      setCopied(entry.command)
                    })
                  }}
                  title={t('help.webpush.copyToClipboard')}
                  type="button"
                >
                  <CopyIcon />
                  {copied === entry.command ? t('help.webpush.copied') : t('help.webpush.copy')}
                </button>
              </div>
            </div>
          ))}
        </div>
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
