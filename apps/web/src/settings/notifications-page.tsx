import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  NOTIFICATION_CHANNEL_KINDS,
  type NotificationAccount,
  type NotificationChannelKind,
  type TelegramLinkCodeResponse,
} from '@stoerdesk/shared'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The own channels page (`specs/10-notifications.md` §11.1, §11.3, §11.12,
 * WP-M14-10): the channels of §11.1 with the state of the linked account of the
 * signed-in user. Only Telegram can be linked at the moment — its state is what
 * this page itself knows after the code redemption, because the API has no
 * account list route yet (`GET /api/v1/notifications/accounts` stays unimplemented).
 * The Matrix section (WP-M14-12) adds the own channel of §11.3/§11.12: the homeserver,
 * the matrix id and the write-only access token are sent to
 * `POST /api/v1/notifications/accounts/matrix` and the linked account is shown
 * afterwards; the section can also `DELETE` the account again. A refused pair or an
 * unreachable homeserver is shown as inline text. The ntfy and WhatsApp Web sections
 * follow in WP-M14-13 and WP-M14-15; the code is shown as text — never as an image —
 * and the error of the API arrives as text.
 */

const jsonHeaders = { 'content-type': 'application/json' }

const handledErrorCodes = ['session_invalid', 'invalid_request', 'unknown'] as const

const matrixErrorCodes = [
  'session_invalid',
  'invalid_request',
  'homeserver_unreachable',
  'unknown',
] as const

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code = errorCode(error)

  return (handledErrorCodes as readonly string[]).includes(code)
    ? t(`notifications.errors.${code}`)
    : t('notifications.errors.unknown')
}

/**
 * The inline text of a refused Matrix linking: a pair the homeserver rejected or
 * a homeserver that is not reachable. The access token never reaches the answer
 * of the API (`specs/10-notifications.md` §11.13), so the section only ever names
 * the failure — it never re-displays the token.
 */
function matrixErrorMessage(t: TFunction<'common'>, error: unknown): string {
  const code = errorCode(error)

  return (matrixErrorCodes as readonly string[]).includes(code)
    ? t(`notifications.matrix.errors.${code}`)
    : t('notifications.matrix.errors.unknown')
}

/**
 * The state of one channel for the overview: Telegram is the only channel this
 * page can know (the redemption of the code stored the account); signal and
 * email carry the recipients of the instance and never an own account; the
 * other kinds have their linking in the later packages.
 */
function channelState(kind: NotificationChannelKind, telegramLinked: boolean): string {
  if (kind === 'telegram') {
    return telegramLinked ? 'linked' : 'notLinked'
  }

  if (kind === 'signal' || kind === 'email') {
    return 'none'
  }

  return 'later'
}

export function NotificationsPage() {
  const { t } = useTranslation('common')

  const telegramCode = useQuery({
    queryKey: ['telegram-code'],
    queryFn: () =>
      apiFetch<TelegramLinkCodeResponse>('/v1/notifications/accounts/telegram/code', {
        method: 'POST',
      }),
    retry: false,
  })

  const link = useMutation({
    mutationFn: () =>
      apiFetch<NotificationAccount>('/v1/notifications/accounts/telegram', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ code: telegramCode.data?.code ?? '' }),
      }),
  })

  const [homeserver, setHomeserver] = useState('')
  const [matrixId, setMatrixId] = useState('')
  const [accessToken, setAccessToken] = useState('')

  const matrixLink = useMutation({
    mutationFn: () =>
      apiFetch<NotificationAccount>('/v1/notifications/accounts/matrix', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ homeserver, matrixId, accessToken }),
      }),
    onSuccess: () => {
      setAccessToken('')
    },
  })

  const matrixRemove = useMutation({
    mutationFn: () =>
      apiFetch<void>('/v1/notifications/accounts/matrix', { method: 'DELETE' }),
    onSuccess: () => {
      setAccessToken('')
    },
  })

  const matrixLinked = matrixLink.isSuccess && !matrixRemove.isSuccess

  if (telegramCode.isError) {
    return (
      <main className="min-h-dvh bg-slate-950 p-6 sm:p-8 text-slate-100">
        <Link
          className="mt-6 inline-block rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/settings"
        >
          {t('branding.back')}
        </Link>

        <h1 className="mt-2 text-2xl font-semibold">{t('notifications.title')}</h1>
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, telegramCode.error)}
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 sm:p-8 text-slate-100">
      <Link
        className="mt-6 inline-block rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/settings"
      >
        {t('branding.back')}
      </Link>

      <div className="mt-2 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('notifications.title')}</h1>
        <p className="text-sm text-slate-400">{t('notifications.hint')}</p>
      </div>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {NOTIFICATION_CHANNEL_KINDS.map((kind) => (
          <li key={kind} className="flex items-center justify-between gap-2 text-sm">
            <span>{t(`notifications.kinds.${kind}`)}</span>
            <span className="text-slate-400">
              {t(`notifications.state.${channelState(kind, link.isSuccess)}`)}
            </span>
          </li>
        ))}
      </ul>

      <section
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        aria-labelledby="telegram-heading"
      >
        <h2 id="telegram-heading" className="text-lg font-semibold">
          {t('notifications.kinds.telegram')}
        </h2>

        {telegramCode.isPending ? (
          <p className="text-sm text-slate-400">{t('auth.loading')}</p>
        ) : null}

        {telegramCode.isSuccess ? (
          <>
            <p className="text-sm text-slate-300">{t('notifications.telegram.guidance')}</p>
            <p className="mt-1 text-xs text-slate-400">
              {t('notifications.telegram.expiresHint')}
            </p>
            <p
              aria-live="polite"
              className="mt-2 rounded bg-slate-950 py-2 px-4 font-mono tracking-widest text-lg text-sky-300"
            >
              {telegramCode.data?.code ?? ''}
            </p>
          </>
        ) : null}

        <button
          className="mt-2 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          disabled={telegramCode.isPending || link.isPending}
          onClick={() => link.mutate()}
          type="button"
        >
          {t('notifications.telegram.submit')}
        </button>

        {link.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {errorMessage(t, link.error)}
          </p>
        ) : null}

        {link.isSuccess ? (
          <>
            <p className="mt-2 text-sm text-emerald-400">
              {t('notifications.telegram.linked', { chatId: link.data.externalId })}
            </p>
            {link.data.label !== '' ? (
              <p className="mt-1 text-sm text-slate-400">
                {t('notifications.telegram.accountLabel', { label: link.data.label })}
              </p>
            ) : null}
          </>
        ) : null}

        <p className="mt-2 text-sm text-slate-400">{t('notifications.telegram.removeHint')}</p>
      </section>

      <section
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        aria-labelledby="matrix-heading"
      >
        <h2 id="matrix-heading" className="text-lg font-semibold">
          {t('notifications.kinds.matrix')}
        </h2>

        <p className="text-sm text-slate-300">{t('notifications.matrix.guidance')}</p>

        <label className="flex flex-col gap-1 text-sm" htmlFor="matrix-homeserver">
          {t('notifications.matrix.homeserverField')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-50"
            disabled={matrixLink.isPending || matrixRemove.isPending}
            id="matrix-homeserver"
            onChange={(event) => setHomeserver(event.target.value)}
            value={homeserver}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm" htmlFor="matrix-matrixid">
          {t('notifications.matrix.matrixIdField')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-50"
            disabled={matrixLink.isPending || matrixRemove.isPending}
            id="matrix-matrixid"
            onChange={(event) => setMatrixId(event.target.value)}
            value={matrixId}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm" htmlFor="matrix-token">
          {t('notifications.matrix.tokenField')}
          <input
            autoComplete="new-password"
            className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-50"
            disabled={matrixLink.isPending || matrixRemove.isPending}
            id="matrix-token"
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder={t('notifications.matrix.tokenPlaceholder')}
            type="password"
            value={accessToken}
          />
        </label>

        <button
          className="mt-2 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          disabled={
            accessToken === '' ||
            homeserver === '' ||
            matrixId === '' ||
            matrixLink.isPending ||
            matrixRemove.isPending
          }
          onClick={() => matrixLink.mutate()}
          type="button"
        >
          {t('notifications.matrix.submit')}
        </button>

        {matrixLink.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {matrixErrorMessage(t, matrixLink.error)}
          </p>
        ) : null}

        {matrixLinked ? (
          <>
            <p className="mt-2 text-sm text-emerald-400">
              {t('notifications.matrix.linked', { matrixId: matrixLink.data.externalId })}
            </p>
            {matrixLink.data.secretSet ? (
              <p className="mt-1 text-sm text-slate-400">{t('notifications.matrix.secretSet')}</p>
            ) : null}
          </>
        ) : null}

        <button
          className="mt-2 rounded bg-slate-700 px-4 py-2 font-medium text-slate-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          disabled={!matrixLinked || matrixRemove.isPending}
          onClick={() => matrixRemove.mutate()}
          type="button"
        >
          {t('notifications.matrix.remove')}
        </button>

        {matrixRemove.isSuccess ? (
          <p className="mt-2 text-sm text-emerald-400">{t('notifications.matrix.removed')}</p>
        ) : null}
      </section>
    </main>
  )
}
