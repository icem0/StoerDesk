import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  AcknowledgeDeliveryResponse,
  DeliveryProblemsResponse,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
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
 */

const jsonHeaders = { 'content-type': 'application/json' }

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

/** The reason of a machine code of a failed delivery (§11.8 of the channels). */
function makeReasonOf(t: unknown) {
  const translate = t as (key: string, opts?: unknown) => string

  return (code: string): string => {
    if (code === '') {
      return ''
    }

    const key = `admin.channels.errors.${code}`
    const translated = translate(key)

    return translated === key ? translate('admin.channels.errors.http_error', { code }) : translated
  }
}

export function DeliveryPage() {
  const { t } = useTranslation('settings')
  const reasonOf = makeReasonOf(t)
  const mayRead = usePermission('notification.read')
  const mayWrite = usePermission('notification.write')
  const queryClient = useQueryClient()
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
        <p className="mt-1 text-sm text-slate-400">{t('admin.delivery.hint')}</p>
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
                  className="min-h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
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
                          time: problem.acknowledgedAt
                            ? new Date(problem.acknowledgedAt).toLocaleString()
                            : '',
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
                        time: new Date(problem.lastFailureAt).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                  {problem.lastError !== null && problem.lastError !== '' ? (
                    <p className="text-sm text-rose-300">{reasonOf(problem.lastError)}</p>
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
              <ul className="flex flex-col gap-1">
                {failures.map((failure) => (
                  <li className="flex flex-wrap items-baseline gap-2 text-sm" key={failure.id}>
                    <span className="text-slate-400">
                      {new Date(failure.failedAt).toLocaleString()}
                    </span>
                    <span className="font-medium text-slate-200">
                      {t(`admin.channels.kinds.${failure.channel}`)}
                    </span>
                    <span className="text-slate-400">
                      {t('notifications:selection.events.' + failure.eventType, {
                        defaultValue: failure.eventType,
                      })}
                    </span>
                    <span className="text-slate-400">
                      {t('admin.delivery.failures.attempts', { count: failure.attempts })}
                    </span>
                    {failure.error !== null && failure.error !== '' ? (
                      <span className="text-rose-300">{reasonOf(failure.error)}</span>
                    ) : null}
                    {failure.ticketNo !== null ? (
                      <Link className="text-sky-300 underline" to={`/tickets/${failure.ticketNo}`}>
                        {failure.ticketNo}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{t('admin.delivery.failures.noTicket')}</span>
                    )}
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

      <Link className="text-sm text-sky-300 underline" to="/admin/channels">
        {t('admin.delivery.channelsLink')}
      </Link>
    </section>
  )
}
