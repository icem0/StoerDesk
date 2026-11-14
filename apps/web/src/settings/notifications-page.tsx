import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  NOTIFICATION_CHANNEL_KINDS,
  NOTIFICATION_EVENT_TYPES,
  type ChannelConfigurationListResponse,
  type NotificationAccount,
  type NotificationChannelKind,
  type NotificationEventType,
  type NotificationPreferenceEntry,
  type NotificationPreferencesListResponse,
  type TelegramLinkCodeResponse,
} from '@stoerdesk/shared'
import { ApiError, apiFetch } from '../lib/api'
import { NtfySubscription } from '../features/settings/NtfySubscription'

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
 * unreachable homeserver is shown as inline text. The ntfy section (WP-M14-13)
 * fetches `GET /api/v1/notifications/accounts/ntfy` (the subscription address of the
 * user derived from the user id — `stoerdesk-<userId>` — plus the `ntfy://<topic>`
 * deep link) and mounts the `NtfySubscription` card of WP-M7-03 with the API answer
 * as its props, so the browser sees the subscription QR of the user instead of the
  * build-time `VITE_NTFY_*` pair (the fallback stays for an image that carries them);
  * the WhatsApp Web section (WP-M14-15) shows the bridge of §11.6 — its state, its chats
  * from `GET /api/v1/notifications/accounts/whatsapp/status`, the chat the user connects as
  * their account via `POST /api/v1/notifications/accounts/whatsapp` and the button to
  * `DELETE` it again; an unreachable bridge shows the chats-are-empty state, never an
  * error — and the code is shown as text — never as an image —
 * and the error of the API arrives as text. The selection section (WP-M14-17) shows one
 * row per event type of the seven of §11.4 with the channels as checkboxes: a channel that
 * is not configured is not offered and a configured channel without a linked account of the
 * user is marked as such; the saved selection is read from and written to
 * `GET`/`PUT /api/v1/notifications/preferences` (WP-M14-16) and the hint names the rule of
 * the precedence of §11.4.
 */

const jsonHeaders = { 'content-type': 'application/json' }

const handledErrorCodes = [
  'session_invalid',
  'invalid_request',
  'channel_not_configured',
  'unknown',
] as const

const matrixErrorCodes = [
  'session_invalid',
  'invalid_request',
  'homeserver_unreachable',
  'unknown',
] as const

/** The subscription answer of `GET /api/v1/notifications/accounts/ntfy` (WP-M14-13). */
interface NtfySubscriptionAnswer {
  publicUrl: string
  topic: string
  subscriptionUrl: string
  deepLink: string
}

/** The bridge answer of `GET /api/v1/notifications/accounts/whatsapp/status` (WP-M14-15). */
interface WhatsAppStatusAnswer {
  connected: boolean
  chats: Array<{ id: string; label: string }>
}

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
 * The inline text of a failing selection read or write: a channel list or a
 * preference load that the API refused. The selection uses its own texts so it
 * never repeats the error text of a channel section on the same page.
 */
function selectionErrorMessage(t: TFunction<'common'>, error: unknown): string {
  const code = errorCode(error)

  return (handledErrorCodes as readonly string[]).includes(code)
    ? t(`notifications.selection.errors.${code}`)
    : t('notifications.selection.errors.unknown')
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

  const ntfySubscription = useQuery({
    queryKey: ['ntfy-subscription'],
    queryFn: () => apiFetch<NtfySubscriptionAnswer>('/v1/notifications/accounts/ntfy'),
    retry: false,
  })

  const whatsappStatus = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => apiFetch<WhatsAppStatusAnswer>('/v1/notifications/accounts/whatsapp/status'),
    retry: false,
  })

  const whatsappLink = useMutation({
    mutationFn: (variables: { chatId: string }) =>
      apiFetch<NotificationAccount>('/v1/notifications/accounts/whatsapp', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ chatId: variables.chatId }),
      }),
  })

  const whatsappRemove = useMutation({
    mutationFn: () =>
      apiFetch<void>('/v1/notifications/accounts/whatsapp', { method: 'DELETE' }),
  })

  const whatsappLinked = whatsappLink.isSuccess && !whatsappRemove.isSuccess

  /** The configured channels of the instance (`specs/10-notifications.md` §11.1). */
  const channelConfigs = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => apiFetch<ChannelConfigurationListResponse>('/v1/admin/channels'),
    retry: false,
  })

  /** The saved selection of the user (`specs/10-notifications.md` §11.4, WP-M14-16). */
  const preferenceLoad = useQuery({
    queryKey: ['notifications-preferences'],
    queryFn: () => apiFetch<NotificationPreferencesListResponse>('/v1/notifications/preferences'),
    retry: false,
  })

  /** The saved selection (or the one edited on this page) as `${eventType}:${channel}` keys. */
  const [selection, setSelection] = useState<Set<string> | null>(null)

  const preferenceSave = useMutation({
    mutationFn: (preferences: NotificationPreferenceEntry[]) =>
      apiFetch<NotificationPreferencesListResponse>('/v1/notifications/preferences', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ preferences }),
      }),
    onSuccess: (result) => {
      setSelection(
        new Set((result?.preferences ?? []).map((entry) => `${entry.eventType}:${entry.channel}`)),
      )
    },
  })

  const savedKeys = new Set(
    (preferenceLoad.data?.preferences ?? []).map((entry) => `${entry.eventType}:${entry.channel}`),
  )
  const effectiveSelection = new Set(selection ?? savedKeys)

  /** The channels of §11.1 that are configured and enabled for the instance. */
  const configuredKinds = new Set(
    (channelConfigs.data?.channels ?? []).filter((channel) => channel.enabled).map(
      (channel) => channel.kind,
    ),
  )

  /** A configured channel that has no linked account of the user cannot be selected. */
  function channelLinked(kind: NotificationChannelKind): boolean {
    if (kind === 'telegram') return link.isSuccess
    if (kind === 'matrix') return matrixLinked
    if (kind === 'whatsapp') return whatsappLinked
    if (kind === 'ntfy')
      return ntfySubscription.isSuccess && (ntfySubscription.data?.publicUrl ?? '') !== ''
    return true
  }

  function toggleSelection(key: string, on: boolean): void {
    const next = new Set(effectiveSelection)

    if (on) {
      next.add(key)
    } else {
      next.delete(key)
    }

    setSelection(next)
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
        aria-labelledby="selection-heading"
      >
        <h2 id="selection-heading" className="text-lg font-semibold">
          {t('notifications.selection.heading')}
        </h2>

        <p className="text-sm text-slate-300">{t('notifications.selection.hint')}</p>

        {channelConfigs.isPending || preferenceLoad.isPending ? (
          <p className="text-sm text-slate-400">{t('auth.loading')}</p>
        ) : null}

        {channelConfigs.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {selectionErrorMessage(t, channelConfigs.error)}
          </p>
        ) : null}

        {preferenceLoad.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {selectionErrorMessage(t, preferenceLoad.error)}
          </p>
        ) : null}

        {NOTIFICATION_EVENT_TYPES.map((eventType) => (
          <div
            key={eventType}
            className="mt-3 flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="text-slate-200">
              {t(`notifications.selection.events.${eventType}`)}
            </span>

            {NOTIFICATION_CHANNEL_KINDS.filter((kind) => configuredKinds.has(kind)).map(
              (kind) => {
                const key = `${eventType}:${kind}`

                return (
                  <span
                    key={kind}
                    className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1"
                  >
                    <input
                      aria-label={t(`notifications.kinds.${kind}`)}
                      checked={effectiveSelection.has(key)}
                      className="rounded bg-slate-950 disabled:opacity-40"
                      disabled={
                        !channelLinked(kind) ||
                        preferenceSave.isPending ||
                        channelConfigs.isPending ||
                        preferenceLoad.isPending
                      }
                      id={`pref-${key}`}
                      onChange={(event) =>
                        toggleSelection(key, (event.target as HTMLInputElement).checked)
                      }
                      type="checkbox"
                    />
                    <span>{t(`notifications.kinds.${kind}`)}</span>
                    {!channelLinked(kind) ? (
                      <span className="text-amber-400">{t('notifications.selection.noAccount')}</span>
                    ) : null}
                  </span>
                )
              },
            )}
          </div>
        ))}

        <button
          className="mt-2 rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          disabled={
            preferenceSave.isPending ||
            channelConfigs.isPending ||
            preferenceLoad.isPending ||
            channelConfigs.isError ||
            preferenceLoad.isError
          }
          onClick={() =>
            preferenceSave.mutate(
              [...effectiveSelection].map((key) => {
                const separator = key.indexOf(':')

                return {
                  eventType: key.slice(0, separator) as NotificationEventType,
                  channel: key.slice(separator + 1) as NotificationChannelKind,
                }
              }).sort(
                (a, b) =>
                  a.eventType.localeCompare(b.eventType) ||
                    a.channel.localeCompare(b.channel),
              ),
            )
          }
          type="button"
        >
          {t('notifications.selection.save')}
        </button>

        {preferenceSave.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {selectionErrorMessage(t, preferenceSave.error)}
          </p>
        ) : null}

        {preferenceSave.isSuccess ? (
          <p className="mt-2 text-sm text-emerald-400">{t('notifications.selection.saved')}</p>
        ) : null}
      </section>

      {ntfySubscription.isSuccess &&
      (ntfySubscription.data?.publicUrl ?? '') !== '' &&
      (ntfySubscription.data?.topic ?? '') !== '' ? (
        <div className="mt-6">
          <NtfySubscription
            publicUrl={ntfySubscription.data?.publicUrl ?? ''}
            topic={ntfySubscription.data?.topic ?? ''}
          />
        </div>
      ) : (
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          aria-labelledby="ntfy-heading"
        >
          <h2 id="ntfy-heading" className="text-lg font-semibold">
            {t('notifications.kinds.ntfy')}
          </h2>

          {ntfySubscription.isError ? (
            <p role="alert" className="text-sm text-red-400">
              {errorMessage(t, ntfySubscription.error)}
            </p>
          ) : null}

          {ntfySubscription.isSuccess ? (
            <p className="text-sm text-amber-400">{t('ntfy.notConfigured')}</p>
          ) : null}

          {ntfySubscription.isPending ? (
            <p className="text-sm text-slate-400">{t('auth.loading')}</p>
          ) : null}
        </section>
      )}

      <section
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        aria-labelledby="telegram-heading"
      >
        <h2 id="telegram-heading" className="text-lg font-semibold">
          {t('notifications.kinds.telegram')}
        </h2>

        {telegramCode.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(t, telegramCode.error)}
          </p>
        ) : null}

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

      <section
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        aria-labelledby="whatsapp-heading"
      >
        <h2 id="whatsapp-heading" className="text-lg font-semibold">
          {t('notifications.kinds.whatsapp')}
        </h2>

        <p className="text-sm text-slate-300">{t('notifications.whatsapp.guidance')}</p>

        {whatsappStatus.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {errorMessage(t, whatsappStatus.error)}
          </p>
        ) : null}

        {whatsappStatus.isSuccess && !whatsappStatus.data?.connected ? (
          <p className="mt-2 text-sm text-amber-400">{t('notifications.whatsapp.notConnected')}</p>
        ) : null}

        {whatsappStatus.isSuccess && whatsappStatus.data?.connected ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {(whatsappStatus.data?.chats ?? []).map((chat) => {
              const name = chat.label === '' ? chat.id : chat.label

              return (
                <li key={chat.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{name}</span>
                  <button
                    className="rounded bg-sky-700 px-4 py-1 font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    disabled={whatsappLinked || whatsappLink.isPending || whatsappRemove.isPending}
                    onClick={() => whatsappLink.mutate({ chatId: chat.id })}
                    type="button"
                  >
                    {t('notifications.whatsapp.connectChat', { label: name })}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {whatsappLink.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {errorMessage(t, whatsappLink.error)}
          </p>
        ) : null}

        {whatsappLinked ? (
          <>
            <p className="mt-2 text-sm text-emerald-400">
              {t('notifications.whatsapp.linked', { chatId: whatsappLink.data.externalId })}
            </p>
            {whatsappLink.data.label !== '' ? (
              <p className="mt-1 text-sm text-slate-400">
                {t('notifications.whatsapp.accountLabel', { label: whatsappLink.data.label })}
              </p>
            ) : null}
          </>
        ) : null}

        <button
          className="mt-2 rounded bg-slate-700 px-4 py-2 font-medium text-slate-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          disabled={!whatsappLinked || whatsappRemove.isPending}
          onClick={() => whatsappRemove.mutate()}
          type="button"
        >
          {t('notifications.whatsapp.remove')}
        </button>

        {whatsappRemove.isSuccess ? (
          <p className="mt-2 text-sm text-emerald-400">{t('notifications.whatsapp.removed')}</p>
        ) : null}
      </section>
    </main>
  )
}
