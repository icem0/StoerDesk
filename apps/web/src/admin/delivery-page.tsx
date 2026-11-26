import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  AcknowledgeDeliveryResponse,
  DeliveryProblemsResponse,
  NotificationDeliveryAttemptListResponse,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { HelpPopover } from '../components/help-popover'
import { helpTriggerClass } from '../components/help-trigger'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The delivery problems (`specs/10-notifications.md` §11.8, §11.12,
 * WP-M14-161b): the channels whose delivery failed and the messages that never
 * arrived. The admin sees the problem here — the channel, the time of the last
 * failure, the machine code and the lost messages — and quits it: the
 * acknowledgement stores the time, so a failure after it opens the problem
 * again.
 *
 * The page is the destination of the badge of the settings menu (WP-M14-161c).
 *
 * The lost message names its cause in the interface language (WP-M14-161d):
 * the event carries its name instead of its machine value, the reason comes
 * from the texts of the delivery page — the texts of the channel
 * administration belong to the ntfy channel and name its topic — and the
 * machine code stands next to the reason, because §11.8 asks the admin to see
 * it.
 *
 * Since phase 30 (ADR-0052) the page carries the **protocol** beside the
 * problems: every delivery attempt of the instance with its recipient, its
 * event, its channel, its state, the machine code of a failure and the number
 * of the attempts (§11.16). The office asked for one page of the delivery,
 * not two. The block needs the right `notification.read_all` — the protocol
 * names the users; the problems stay with `notification.read`.
 */

const jsonHeaders = { 'content-type': 'application/json' }

/** The channels of the protocol (§11.16) — the kinds of the channels. */
const PROTOCOL_CHANNELS = [
  'ntfy',
  'telegram',
  'matrix',
  'signal',
  'email',
  'webpush',
  'whatsapp',
] as const

/** The event types of the protocol (§11.4, §11.18). */
const PROTOCOL_EVENTS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.assignment_answered',
  'ticket.escalated',
  'ticket.resolved',
  'oncall.assigned',
  'oncall.swap_requested',
  'oncall.unconfirmed_reminder',
  'oncall.released',
] as const

/** The states of a delivery attempt (§11.16). */
const PROTOCOL_STATES = ['PENDING', 'SENT', 'FAILED'] as const

/** The time format of the page: the language of the interface, not the browser. */
const timeFormat: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

/**
 * The reason of a failed delivery (§11.8).
 *
 * The texts of the channel administration (`admin.channels.errors.*`) belong to
 * the ntfy channel — they name its topic and its token and are wrong for every
 * other channel. The delivery page therefore carries its own texts for the
 * codes of all channels; the codes only ntfy produces (`http_404`,
 * `http_timeout`, …) keep the texts of the channel administration, and a code
 * without a text is named as such.
 *
 * The channel comes first: the code `send_failed` means something different for
 * the push service than for the mail server.
 */
function makeReasonOf(t: unknown) {
  const translate = t as (key: string, opts?: unknown) => string

  return (code: string, channel: string): string => {
    if (code === '') {
      return ''
    }

    const own = translate(`admin.delivery.reasons.${channel}.${code}`, { defaultValue: '' })

    if (own !== '') {
      return own
    }

    const common = translate(`admin.delivery.reasons.${code}`, { defaultValue: '' })

    if (common !== '') {
      return common
    }

    const channelText = translate(`admin.channels.errors.${code}`, { defaultValue: '' })

    if (channelText !== '') {
      return channelText
    }

    const status = /^http_(\d{3})$/.exec(code)

    if (status !== null) {
      return translate('admin.delivery.reasons.httpStatus', { status: status[1] })
    }

    return translate('admin.delivery.reasons.unknown')
  }
}

/**
 * The name of the event of a lost message: the seven events of the selection
 * (§11.4) carry their name in the `common` namespace, the warning of a broken
 * channel (§11.15) its own; an event without a name keeps its machine value.
 */
function makeEventName(t: unknown) {
  const translate = t as (key: string, opts?: unknown) => string

  return (eventType: string): string => {
    const selected = translate(`common:notifications.eventNames.${eventType}`, {
      defaultValue: '',
    })

    if (selected !== '') {
      return selected
    }

    const instance = translate(`admin.delivery.events.${eventType}`, { defaultValue: '' })

    return instance !== '' ? instance : eventType
  }
}

export function DeliveryPage() {
  const { t, i18n } = useTranslation('settings')
  const reasonOf = makeReasonOf(t)
  const eventName = makeEventName(t)
  const mayRead = usePermission('notification.read')
  const mayWrite = usePermission('notification.write')
  const mayReadAll = usePermission('notification.read_all')
  const queryClient = useQueryClient()

  // The filters of the protocol live in the URL, so a filtered view can be
  // shared (§11.16).
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUserId = searchParams.get('userId') ?? ''
  const filterChannel = searchParams.get('channel') ?? ''
  const filterEventType = searchParams.get('eventType') ?? ''
  const filterState = searchParams.get('state') ?? ''

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)

    if (value === '') {
      next.delete(key)
    } else {
      next.set(key, value)
    }

    setSearchParams(next)
  }

  const protocol = useQuery({
    queryKey: ['deliveryProtocol', filterUserId, filterChannel, filterEventType, filterState],
    queryFn: () => {
      const query = new URLSearchParams()

      if (filterUserId !== '') query.set('userId', filterUserId)
      if (filterChannel !== '') query.set('channel', filterChannel)
      if (filterEventType !== '') query.set('eventType', filterEventType)
      if (filterState !== '') query.set('state', filterState)

      return apiFetch<NotificationDeliveryAttemptListResponse>(
        `/v1/admin/notifications/attempts?${query.toString()}`,
      )
    },
    enabled: mayRead && mayReadAll,
    retry: false,
  })

  const query = useQuery({
    queryKey: ['deliveryProblems'],
    queryFn: () => apiFetch<DeliveryProblemsResponse>('/v1/notifications/delivery'),
    enabled: mayRead,
    retry: false,
  })
  const acknowledge = useMutation({
    mutationFn: (channels: string[]) =>
      apiFetch<AcknowledgeDeliveryResponse>('/v1/notifications/delivery/acknowledge', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(channels.length === 0 ? {} : { channels }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deliveryProblems'] })
    },
  })

  const problems = query.data?.problems ?? []
  const failures = query.data?.failures ?? []
  const openProblems = problems.filter((problem) => problem.open)

  /** The time of a failure in the language of the interface, not the browser. */
  const timeOf = (value: string): string =>
    new Date(value).toLocaleString(i18n.language, timeFormat)

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.delivery.title')}</h1>
      </div>

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('admin.channels.errors.forbidden')}
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-slate-400">{t('admin.delivery.loading')}</p>
      ) : query.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`admin.channels.errors.${errorCode(query.error)}`)}
        </p>
      ) : problems.length === 0 ? (
        <p className="text-sm text-slate-400">{t('admin.delivery.empty')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('admin.delivery.problems.title')}</h2>
              {mayWrite && openProblems.length > 1 ? (
                <button
                  className="min-h-11 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
                  disabled={acknowledge.isPending}
                  onClick={() => acknowledge.mutate([])}
                  type="button"
                >
                  {t('admin.delivery.acknowledgeAll')}
                </button>
              ) : null}
            </div>
            <ul className="flex flex-col gap-2">
              {problems.map((problem) => (
                <li
                  className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
                  key={problem.channel}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-200">
                      {t(`admin.channels.kinds.${problem.channel}`)}
                    </span>
                    {problem.open ? (
                      <span className="rounded bg-rose-900/40 px-2 py-0.5 text-xs font-medium text-rose-200">
                        {t('admin.delivery.problems.open', { count: problem.unacknowledged })}
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-200">
                        {t('admin.delivery.problems.acknowledgedAt', {
                          time: problem.acknowledgedAt ? timeOf(problem.acknowledgedAt) : '',
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">
                    {t('admin.delivery.problems.failed', { count: problem.failed })}
                  </p>
                  {problem.lastFailureAt !== null ? (
                    <p className="text-sm text-slate-400">
                      {t('admin.delivery.problems.lastFailure', {
                        time: timeOf(problem.lastFailureAt),
                      })}
                    </p>
                  ) : null}
                  {problem.lastError !== null && problem.lastError !== '' ? (
                    <p className="flex flex-wrap items-baseline gap-2 text-sm text-rose-300">
                      <span>{reasonOf(problem.lastError, problem.channel)}</span>
                      <span className="font-mono text-xs text-slate-400">
                        {t('admin.delivery.code', { code: problem.lastError })}
                      </span>
                    </p>
                  ) : null}
                  {problem.acknowledgedBy !== null ? (
                    <p className="text-xs text-slate-400">
                      {t('admin.delivery.problems.acknowledgedBy', {
                        by: problem.acknowledgedBy,
                      })}
                    </p>
                  ) : null}
                  {mayWrite && problem.open ? (
                    <button
                      className="self-start rounded-lg border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                      disabled={acknowledge.isPending}
                      onClick={() => acknowledge.mutate([problem.channel])}
                      type="button"
                    >
                      {t('admin.delivery.acknowledge')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('admin.delivery.failures.title')}</h2>
            {failures.length === 0 ? (
              <p className="text-sm text-slate-400">{t('admin.delivery.failures.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {failures.map((failure) => (
                  <li
                    className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/40 p-3"
                    key={failure.id}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-slate-100">
                        {t(`admin.channels.kinds.${failure.channel}`)}
                      </span>
                      <span className="text-slate-300">{eventName(failure.eventType)}</span>
                      <span className="text-xs text-slate-400">{timeOf(failure.failedAt)}</span>
                    </div>
                    {failure.error !== null && failure.error !== '' ? (
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm text-rose-300">
                          {reasonOf(failure.error, failure.channel)}
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          {t('admin.delivery.code', { code: failure.error })}
                        </span>
                      </div>
                    ) : null}
                    {failure.channel === 'webpush' &&
                    (failure.error === 'no_keys' || failure.error === 'send_failed') ? (
                      <Link className="text-xs text-accent-300 underline" to="/help/web-push">
                        {t('admin.delivery.failures.webPushGuide')}
                      </Link>
                    ) : null}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span>
                        {t('admin.delivery.failures.attempts', { count: failure.attempts })}
                      </span>
                      {failure.ticketNo !== null ? (
                        <Link
                          className="text-accent-300 underline"
                          to={`/tickets/${failure.ticketNo}`}
                        >
                          {t('admin.delivery.failures.ticket', { ticket: failure.ticketNo })}
                        </Link>
                      ) : (
                        <span>{t('admin.delivery.failures.noTicket')}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {acknowledge.isSuccess ? (
        <p className="text-sm text-emerald-300" role="status">
          {t('admin.delivery.acknowledged')}
        </p>
      ) : null}
      {acknowledge.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`admin.channels.errors.${errorCode(acknowledge.error)}`)}
        </p>
      ) : null}

      {mayReadAll ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold">{t('admin.delivery.protocol.title')}</h2>
            <HelpPopover
              className={helpTriggerClass}
              label={t('help:triggerFor', { name: t('admin.delivery.protocol.title') })}
              text={t('admin.delivery.protocol.hint')}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-700 p-3">
            <label className="flex flex-col gap-1 text-sm">
              {t('admin.delivery.protocol.filter.recipient')}
              <select
                className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
                value={filterUserId}
                onChange={(event) => updateFilter('userId', event.target.value)}
              >
                <option value="">{t('admin.delivery.protocol.filter.recipientAll')}</option>
                {(protocol.data?.recipients ?? []).map((recipient) => (
                  <option key={recipient.userId} value={recipient.userId}>
                    {recipient.name} ({recipient.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              {t('admin.delivery.protocol.filter.channel')}
              <select
                className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
                value={filterChannel}
                onChange={(event) => updateFilter('channel', event.target.value)}
              >
                <option value="">{t('admin.delivery.protocol.filter.channelAll')}</option>
                {PROTOCOL_CHANNELS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`admin.channels.kinds.${kind}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              {t('admin.delivery.protocol.filter.event')}
              <select
                className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
                value={filterEventType}
                onChange={(event) => updateFilter('eventType', event.target.value)}
              >
                <option value="">{t('admin.delivery.protocol.filter.eventAll')}</option>
                {PROTOCOL_EVENTS.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventName(eventType)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              {t('admin.delivery.protocol.filter.state')}
              <select
                className="min-h-11 rounded bg-slate-900 p-2 text-slate-100"
                value={filterState}
                onChange={(event) => updateFilter('state', event.target.value)}
              >
                <option value="">{t('admin.delivery.protocol.filter.stateAll')}</option>
                {PROTOCOL_STATES.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.delivery.protocol.state.${value.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="min-h-11 rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
              onClick={() => setSearchParams(new URLSearchParams())}
              type="button"
            >
              {t('admin.delivery.protocol.filter.reset')}
            </button>
          </div>

          {protocol.isError ? (
            <p className="text-sm text-rose-400" role="alert">
              {t(`admin.channels.errors.${errorCode(protocol.error)}`)}
            </p>
          ) : protocol.isPending ? (
            <p className="text-sm text-slate-400">{t('admin.delivery.loading')}</p>
          ) : (protocol.data?.attempts ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">{t('admin.delivery.protocol.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(protocol.data?.attempts ?? []).map((attempt) => (
                <li
                  className="flex flex-col gap-1 rounded-xl border border-slate-700 bg-slate-900/40 p-3"
                  key={attempt.id}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-100">{attempt.recipient.name}</span>
                    <span className="text-slate-300">{eventName(attempt.eventType)}</span>
                    <span className="text-xs text-slate-400">
                      {t(`admin.channels.kinds.${attempt.channel}`)}
                    </span>
                    <span
                      className={`text-xs ${
                        attempt.state === 'FAILED' ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {t(`admin.delivery.protocol.state.${attempt.state.toLowerCase()}`)}
                    </span>
                    <span className="text-xs text-slate-400">{timeOf(attempt.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{attempt.title}</span>
                    <span>
                      {t('admin.delivery.protocol.attempts', { count: attempt.attempts })}
                    </span>
                    {attempt.errorCode !== null && attempt.errorCode !== '' ? (
                      <span className="text-rose-300">
                        {t('admin.delivery.code', { code: attempt.errorCode })}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <Link className="text-sm text-accent-300 underline" to="/admin/channels">
        {t('admin.delivery.channelsLink')}
      </Link>
    </section>
  )
}
