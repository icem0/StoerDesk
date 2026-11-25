import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  NOTIFICATION_CHANNEL_KINDS,
  type ChannelTestResponse,
  type NotificationAccount,
  type NotificationAccountListResponse,
  type NotificationChannelKind,
  type NotificationChannelState,
  type NotificationUserCompliance,
  type TelegramLinkCodeResponse,
  type WebPushConfigResponse,
} from '@stoerdesk/shared'
import { ApiError, apiFetch } from '../lib/api'
import { NtfySubscription } from '../features/settings/NtfySubscription'
import { WebPushSubscription } from '../features/settings/WebPushSubscription'

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
 * the precedence of §11.4. The readiness block (WP-M14-32) renders the three readiness event
 * types of §11.4 as their own rows with one checkbox per configured channel; a user without
 * a saved row for a readiness event sees "the channels of the instance" (the fallback of
 * §11.4) and a channel that is not configured is not offered; the settings namespace keys
  * `settings.notifications.events.oncall.*` (de and en) carry the labels of the block.
  * The administration link (WP-M14-54) names `/admin/channels` under the header hint and
  * in the ntfy fallback line: the configuration of the channels itself, the write-only
  * secrets and the test message live there — the link is text only, it never fetches.
  */

const jsonHeaders = { 'content-type': 'application/json' }

const handledErrorCodes = [
  'session_invalid',
  'invalid_request',
  'channel_not_configured',
  'send_failed',
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
 * The text of a refused send (WP-M24-21): the machine code of the refusal of
 * the channel travels in `params.reason` (`http_403`, `http_timeout`, …) and
 * has its own text; a reason without a text is named by its code. Before,
 * every refusal of the send answered a flat `invalid_request`, so a code that
 * never arrived looked like a wrong code.
 */
function sendErrorMessage(t: TFunction<'common'>, error: unknown): string {
  if (errorCode(error) !== 'send_failed') {
    return errorMessage(t, error)
  }

  const raw = error instanceof ApiError ? error.params?.reason : undefined
  const reason = typeof raw === 'string' ? raw : ''
  const key = `notifications.errors.reasons.${reason}`
  const translated = reason === '' ? '' : t(key)

  if (translated !== '' && translated !== key) {
    return translated
  }

  return reason === ''
    ? t('notifications.errors.send_failed')
    : t('notifications.errors.send_failed_reason', { reason })
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
/**
 * The state of a channel of the user (§11.3a, ADR-0045): the server knows it —
 * the answer of `GET /api/v1/notifications/accounts` carries the state of every
 * account, and a channel without an account is *missing*. The web push counts
 * as set up when this browser has a device on the server; the signal channel is
 * a channel of the installation and has no state of its own.
 */
function channelState(
  kind: NotificationChannelKind,
  accounts: Map<NotificationChannelKind, NotificationChannelState>,
  webpushReady: boolean,
): NotificationChannelState | 'instance' {
  if (kind === 'signal') {
    return 'instance'
  }

  if (kind === 'webpush') {
    return webpushReady ? 'ready' : (accounts.get('webpush') ?? 'missing')
  }

  return accounts.get(kind) ?? 'missing'
}

/**
 * The colour of a state (§11.12): green for a channel that works, amber for a
 * channel that is linked but never confirmed, red for a channel that is
 * missing. The symbol makes the difference readable without the colour.
 */
const stateSymbol: Record<NotificationChannelState | 'instance', string> = {
  ready: '✓',
  linked: '●',
  missing: '○',
  instance: '—',
}

const stateClass: Record<NotificationChannelState | 'instance', string> = {
  ready: 'text-emerald-400',
  linked: 'text-amber-400',
  missing: 'text-rose-400',
  instance: 'text-slate-500',
}

export function NotificationsPage() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const { t: st } = useTranslation('settings')

  /**
   * The channel whose setup is open (`specs/10-notifications.md` §11.19,
   * WP-M35-02): only one channel at a time, so the page stays a list of the
   * channels and not a long column of forms nobody needs.
   */
  const [openChannel, setOpenChannel] = useState<NotificationChannelKind | null>(null)

  /** The open channel as a constant — the narrowing survives the closures. */
  const openKind: NotificationChannelKind | null = openChannel


  /**
   * The one-time code of the Telegram bot (§11.3): the server burns the code
   * after ten minutes, so it is only asked for when the channel is open
   * (WP-M35-02) — a page view never burns a code nobody uses.
   */
  const telegramCode = useQuery({
    queryKey: ['telegram-code'],
    queryFn: () =>
      apiFetch<TelegramLinkCodeResponse>('/v1/notifications/accounts/telegram/code', {
        method: 'POST',
      }),
    enabled: openKind === 'telegram',
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

/** Translates an adapter error code into a readable reason for the own-topic test. */
const testReason = (code: string): string => {
  if (code === '') {
    return ''
  }

  const key = `admin.channels.errors.${code}`
  const translated = st(key)

  return translated === key ? code : translated
}

  /** The subscription of the user at ntfy (§11.3) — only when ntfy is open. */
  const ntfySubscription = useQuery({
    queryKey: ['ntfy-subscription'],
    queryFn: () => apiFetch<NtfySubscriptionAnswer>('/v1/notifications/accounts/ntfy'),
    enabled: openKind === 'ntfy',
    retry: false,
  })

  /** The chats of the bridge — only when WhatsApp is open (WP-M35-02). */
  const whatsappStatus = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => apiFetch<WhatsAppStatusAnswer>('/v1/notifications/accounts/whatsapp/status'),
    enabled: openKind === 'whatsapp',
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

  /**
   * The own accounts with the state of every channel (§11.3a, WP-M24-16): the
   * server knows the state — the page never guesses it.
   */
  const accounts = useQuery({
    queryKey: ['notification-accounts'],
    queryFn: () => apiFetch<NotificationAccountListResponse>('/v1/notifications/accounts'),
    retry: false,
  })

  /**
   * The own compliance (§11.9, WP-M24-16): the rule of the administration and
   * the channels of the user that miss it.
   */
  const compliance = useQuery({
    queryKey: ['notification-compliance'],
    queryFn: () => apiFetch<NotificationUserCompliance>('/v1/notifications/compliance'),
    retry: false,
  })


  /**
   * The rule of the administration (§11.9, WP-M35-01): the channels that are
   * mandatory and the number of the channels that are needed. The server
   * answers them with the compliance of the user.
   */
  const requiredChannels = new Set<NotificationChannelKind>(
    compliance.data?.policy?.requiredChannels ?? [],
  )
  const minimumChannelCount = compliance.data?.policy?.minimumChannelCount ?? 0
  const channelCount = compliance.data?.channelCount ?? 0
  const missingChannels = compliance.data?.missing ?? []
  const ruleOff = requiredChannels.size === 0 && minimumChannelCount === 0

  /** The state of every channel of the user, as the server answers it. */
  const accountStates = new Map<NotificationChannelKind, NotificationChannelState>(
    (accounts.data?.accounts ?? []).map((account) => [account.channel, account.state]),
  )

  /** The own mail address — the account of the e-mail channel (§11.3). */
  const [mailAddress, setMailAddress] = useState('')

  /** The address of the user is stored as the account of the e-mail channel. */
  const saveMailAddress = useMutation({
    mutationFn: (address: string) =>
      apiFetch<NotificationAccount>('/v1/notifications/accounts/email', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ address }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-accounts'] })
    },
  })

  /** The address is removed again — the channel of the user is gone. */
  const removeMailAddress = useMutation({
    mutationFn: () =>
      apiFetch<void>('/v1/notifications/accounts/email', { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-accounts'] })
    },
  })

  /** The code of the channel the user confirms at the moment. */
  const [verificationCode, setVerificationCode] = useState('')

  /** The channel whose code is entered at the moment. */
  const [verificationChannel, setVerificationChannel] = useState<NotificationChannelKind | null>(
    null,
  )

  /**
   * The button "Code senden": the server sends the one-time code over the
   * channel of the account (§11.3a).
   */
  const sendCode = useMutation({
    mutationFn: (channel: NotificationChannelKind) =>
      apiFetch<{ expiresAt: string }>(`/v1/notifications/accounts/${channel}/verification`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
  })

  /** The code the user copied confirms the account (§11.3a). */
  const confirmCode = useMutation({
    mutationFn: (input: { channel: NotificationChannelKind; code: string }) =>
      apiFetch<{ confirmedAt: string }>(
        `/v1/notifications/accounts/${input.channel}/verification/confirm`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ code: input.code }),
        },
      ),
    onSuccess: () => {
      setVerificationCode('')
      setVerificationChannel(null)
      void queryClient.invalidateQueries({ queryKey: ['notification-accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-compliance'] })
    },
  })

  /** The own devices (`GET /api/v1/notifications/accounts/webpush`, WP-M14-124). */
  const webPushConfig = useQuery({
    queryKey: ['webpush-config'],
    queryFn: () => apiFetch<WebPushConfigResponse>('/v1/notifications/accounts/webpush'),
    retry: false,
  })

  const webPushState: 'linked' | 'notLinked' | 'later' =
    webPushConfig.isSuccess && (webPushConfig.data?.publicKey ?? '') !== ''
      ? (webPushConfig.data?.subscriptions ?? 0) > 0
        ? 'linked'
        : 'notLinked'
      : 'later'

  const ntfyTest = useMutation({
    mutationFn: () =>
      apiFetch<ChannelTestResponse>('/v1/notifications/accounts/ntfy/test', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
  })

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
        <Link
          className="mt-1 inline-block text-xs text-sky-300 underline hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          to="/admin/channels"
        >
          {t('notifications.administration.link')}
        </Link>
      </div>

      {compliance.isSuccess && compliance.data.compliant === false ? (
        <div
          className="mt-6 flex flex-col gap-2 rounded-xl border border-amber-500 bg-amber-950/40 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-amber-200">
            {t('notifications.compliance.warning')}
          </p>
          <a
            className="text-sm text-amber-200 underline hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            href="#channels"
          >
            {t('notifications.compliance.link')}
          </a>
        </div>
      ) : null}

      <section
        className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        aria-labelledby="overview-heading"
      >
        <h2 id="overview-heading" className="text-lg font-semibold">
          {t('notifications.overview.heading')}
        </h2>

        <p className="text-sm text-slate-300">{t('notifications.overview.hint')}</p>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-slate-300">
            {ruleOff
              ? t('notifications.overview.ruleOff')
              : t('notifications.overview.count', {
                  count: channelCount,
                  minimum: minimumChannelCount,
                })}
          </li>
          <li
            className={
              compliance.isSuccess && compliance.data.compliant
                ? 'text-emerald-300'
                : 'text-amber-300'
            }
          >
            {compliance.isSuccess && compliance.data.compliant
              ? t('notifications.overview.fulfilled')
              : t('notifications.overview.missing', {
                  channels: missingChannels
                    .map((kind) => t(`notifications.kinds.${kind}`))
                    .join(', '),
                })}
          </li>
        </ul>

        <p className="text-sm text-slate-400">
          {t('notifications.administration.hint')}
          <Link
            className="ml-2 text-sky-300 underline hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            to="/admin/channels"
          >
            {t('notifications.administration.link')}
          </Link>
        </p>
      </section>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2" id="channels">
        {NOTIFICATION_CHANNEL_KINDS.map((kind) => {
          const state = channelState(kind, accountStates, webPushState === 'linked')
          const isOpen = openKind === kind
          const isRequired = requiredChannels.has(kind)

          return (
            <li
              key={kind}
              className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={stateClass[state]}>
                  {stateSymbol[state]}
                </span>
                <span>{t(`notifications.kinds.${kind}`)}</span>
                {isRequired ? (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
                    {t('notifications.overview.required')}
                  </span>
                ) : null}
              </span>

              <span className="flex items-center justify-between gap-2">
                <span className="text-slate-400">
                  {state === 'instance'
                    ? t('notifications.state.instance')
                    : t(`notifications.state.${state}`)}
                </span>

                {kind === 'signal' ? null : (
                  <button
                    aria-controls={`channel-panel-${kind}`}
                    aria-expanded={isOpen}
                    className="min-h-11 rounded-lg border border-slate-600 px-3 text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    onClick={() => setOpenChannel(isOpen ? null : kind)}
                    type="button"
                  >
                    {isOpen
                      ? t('notifications.overview.close')
                      : t('notifications.overview.configure')}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>




      {openKind === 'ntfy' ? (
        <>
        {ntfySubscription.isSuccess &&
        (ntfySubscription.data?.publicUrl ?? '') !== '' &&
        (ntfySubscription.data?.topic ?? '') !== '' ? (
          <div className="mt-6">
            <NtfySubscription
              publicUrl={ntfySubscription.data?.publicUrl ?? ''}
              topic={ntfySubscription.data?.topic ?? ''}
            />
          </div>
        ) : null}

        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          id={`channel-panel-ntfy`}
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

          {ntfySubscription.isSuccess && ntfySubscription.data?.topic !== '' ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <button
                className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                disabled={ntfyTest.isPending}
                onClick={() => ntfyTest.mutate()}
                type="button"
              >
                {ntfyTest.isPending
                  ? st('notifications.ntfy.test.sending')
                  : st('notifications.ntfy.test.button')}
              </button>
              {ntfyTest.isSuccess ? (
                <p
                  className={`text-sm ${ntfyTest.data?.delivered ? 'text-emerald-300' : 'text-rose-400'}`}
                  role="status"
                >
                {ntfyTest.data?.delivered
                  ? st('notifications.ntfy.test.delivered')
                  : st('notifications.ntfy.test.failed', {
                      reason: testReason(ntfyTest.data?.code ?? 'unknown'),
                    })}
                </p>
              ) : null}
              {ntfyTest.isError ? (
                <p className="text-sm text-rose-400" role="alert">
                  {errorMessage(t, ntfyTest.error)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
        </>
      ) : null}

      {openKind === 'telegram' ? (
        <>
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          id={`channel-panel-telegram`}
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
        </>
      ) : null}

      {openKind === 'webpush' ? (
        <div id="channel-panel-webpush">
          <WebPushSubscription />
        </div>
      ) : null}

      {openKind === 'email' ? (
        <>
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          id={`channel-panel-email`}
          aria-labelledby="email-heading"
        >
          <h2 id="email-heading" className="text-lg font-semibold">
            {t('notifications.email.heading')}
          </h2>

          <p className="text-sm text-slate-300">{t('notifications.email.guidance')}</p>

          <label className="flex flex-col gap-1 text-sm" htmlFor="email-address">
            {t('notifications.email.addressLabel')}
            <input
              className="rounded bg-slate-950 p-2 text-slate-100 disabled:opacity-50"
              disabled={saveMailAddress.isPending}
              id="email-address"
              onChange={(event) => setMailAddress(event.target.value)}
              type="email"
              value={mailAddress}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-11 rounded bg-sky-700 px-4 font-medium text-white disabled:opacity-50"
              disabled={saveMailAddress.isPending || mailAddress.trim() === ''}
              onClick={() => saveMailAddress.mutate(mailAddress.trim())}
              type="button"
            >
              {t('notifications.email.save')}
            </button>

            <button
              className="min-h-11 rounded bg-slate-700 px-4 font-medium text-slate-100 disabled:opacity-50"
              disabled={
                removeMailAddress.isPending ||
                !accounts.data?.accounts.some((account) => account.channel === 'email')
              }
              onClick={() => removeMailAddress.mutate()}
              type="button"
            >
              {t('notifications.email.remove')}
            </button>
          </div>

          {saveMailAddress.isSuccess ? (
            <p className="text-sm text-emerald-400">{t('notifications.email.saved')}</p>
          ) : null}

          {removeMailAddress.isSuccess ? (
            <p className="text-sm text-emerald-400">{t('notifications.email.removed')}</p>
          ) : null}

          {saveMailAddress.isError ? (
            <p className="text-sm text-rose-400" role="alert">
              {errorMessage(t, saveMailAddress.error)}
            </p>
          ) : null}
        </section>
        </>
      ) : null}

      {openKind === 'matrix' ? (
        <>
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          id={`channel-panel-matrix`}
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
        </>
      ) : null}

      {openKind === 'whatsapp' ? (
        <>
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          id={`channel-panel-whatsapp`}
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
        </>
      ) : null}
      {openKind !== null && openKind !== 'signal' ? (
        <section
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
          aria-labelledby="verification-heading"
        >
          <h2 id="verification-heading" className="text-lg font-semibold">
            {t('notifications.verification.heading')}
          </h2>

          <p className="text-sm text-slate-300">{t('notifications.verification.hint')}</p>

          <ul className="flex flex-col gap-3">
            {NOTIFICATION_CHANNEL_KINDS.filter((kind) => kind !== 'signal').map((kind) => {
              const state = channelState(kind, accountStates, webPushState === 'linked')
              const hasAccount = state !== 'missing'

              return (
                <li key={kind} className="flex flex-col gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={stateClass[state]}>
                      {stateSymbol[state]}
                    </span>
                    <span>{t(`notifications.kinds.${kind}`)}</span>
                  </span>

                  {hasAccount ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <button
                        className="min-h-11 rounded-lg border border-slate-600 px-4 text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                        disabled={sendCode.isPending}
                        onClick={() => sendCode.mutate(kind)}
                        type="button"
                      >
                        {t('notifications.verification.send')}
                      </button>

                      <label className="flex flex-col gap-1" htmlFor={`code-${kind}`}>
                        {t('notifications.verification.codeLabel')}
                        <input
                          className="rounded bg-slate-950 p-2 font-mono tracking-widest text-slate-100"
                          id={`code-${kind}`}
                          onChange={(event) => {
                            setVerificationChannel(kind)
                            setVerificationCode(event.target.value)
                          }}
                          value={verificationChannel === kind ? verificationCode : ''}
                        />
                      </label>

                      <button
                        className="min-h-11 rounded bg-sky-700 px-4 font-medium text-white disabled:opacity-50"
                        disabled={
                          verificationChannel !== kind ||
                          verificationCode.trim() === '' ||
                          confirmCode.isPending
                        }
                        onClick={() =>
                          confirmCode.mutate({ channel: kind, code: verificationCode })
                        }
                        type="button"
                      >
                        {t('notifications.verification.confirm')}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      {t('notifications.verification.noAccount')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {sendCode.isSuccess ? (
            <p className="text-sm text-emerald-400">{t('notifications.verification.sent')}</p>
          ) : null}

          {sendCode.isError ? (
            <p className="text-sm text-rose-400" role="alert">
              {sendErrorMessage(t, sendCode.error)}
            </p>
          ) : null}

          {confirmCode.isError ? (
            <p className="text-sm text-rose-400" role="alert">
              {errorMessage(t, confirmCode.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
