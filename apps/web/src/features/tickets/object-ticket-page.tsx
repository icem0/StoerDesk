import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { qrTokenSchema, type PublicObjectComment, type PublicObjectTicket } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * The public view of an open ticket of an object (`specs/06-report-form.md`
 * §7.10.3/§7.10.4, ADR-0061).
 *
 * The holder of the QR code of the object stands at that object: the code is
 * the capability of this narrow view and of a comment on the ticket. The page
 * lies outside the shell of the app — a reporter never sees the login form.
 *
 * The answer of the API carries the number, the status, the times, the public
 * events and the public comments — never the description, the contact or the
 * photos of another reporter.
 */

const jsonHeaders = { 'content-type': 'application/json' }

function useObjectTicket(token: string, ticketNo: string) {
  return useQuery({
    queryKey: ['public-object-ticket', token, ticketNo],
    queryFn: () =>
      apiFetch<PublicObjectTicket>(
        `/v1/public/objects/${token}/tickets/${encodeURIComponent(ticketNo)}`,
      ),
    enabled: qrTokenSchema.safeParse(token).success && ticketNo !== '',
    retry: false,
  })
}

export function ObjectTicketPage() {
  const { t, i18n } = useTranslation('ticket')
  const { token: pathToken, ticketNo: pathTicketNo } = useParams<{
    token: string
    ticketNo: string
  }>()
  const token = pathToken ?? ''
  const ticketNo = pathTicketNo ?? ''
  const locale = i18n.language === 'en' ? 'en' : 'de'
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [clientUuid] = useState(() => globalThis.crypto.randomUUID())
  const [done, setDone] = useState<string | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  const ticket = useObjectTicket(token, ticketNo)

  const comment = useMutation({
    mutationFn: () =>
      apiFetch<PublicObjectComment>(
        `/v1/public/objects/${token}/tickets/${encodeURIComponent(ticketNo)}/comments`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ qrToken: token, clientUuid, text }),
        },
      ),
    onSuccess: (answer) => {
      setDone(answer.at)
      setProblem(undefined)
      setText('')
      void queryClient.invalidateQueries({ queryKey: ['public-object-ticket', token, ticketNo] })
    },
    onError: (known: unknown) => {
      const code = known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error'

      setProblem(`report.object.errors.${code}`)
    },
  })

  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )

  const data = ticket.data

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <span className="font-semibold tracking-tight">{t('common:app.title')}</span>
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('report.object.title')}</h2>
          <Link className="text-sm text-sky-300 underline" to={`/m/${token}`}>
            {t('report.object.back')}
          </Link>
        </div>

        {ticket.isPending ? <p className="text-sm text-slate-400">{t('report.object.loading')}</p> : null}

        {ticket.isError ? (
          <p className="text-sm text-rose-400" role="alert">
            {t('report.object.errors.not_found')}
          </p>
        ) : null}

        {data ? (
          <>
            <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold">
                  {t('status.ticketNo', { ticketNo: data.ticketNo })}
                </h1>
                <span
                  className="rounded-full border border-sky-700 bg-sky-950/60 px-3 py-1 text-sm font-medium text-sky-200"
                  data-testid="status-badge"
                >
                  {t(`status.values.${data.status}`)}
                </span>
              </div>

              <dl className="flex flex-col gap-1 text-sm text-slate-300">
                <div>
                  <dt className="inline text-slate-400">{t('status.reportedAtLabel')} </dt>
                  <dd className="inline">{format(data.reportedAt)}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">{t('status.deadlineLabel')} </dt>
                  <dd className="inline">{format(data.deadlineAt)}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2">
                <h2 className="text-base font-semibold">{t('status.timeline')}</h2>
                <ol className="flex flex-col gap-3">
                  {data.events.map((event, index) => (
                    <li
                      className="flex flex-col gap-0.5 border-l-2 border-slate-700 pl-3"
                      key={`${event.type}-${event.at}-${index}`}
                    >
                      <span className="text-sm font-medium">{t(`status.events.${event.type}`)}</span>
                      <time className="text-xs text-slate-400" dateTime={event.at}>
                        {format(event.at)}
                      </time>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-base font-semibold">{t('report.object.comments')}</h2>
                {data.comments.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('report.object.noComments')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.comments.map((entry, index) => (
                      <li className="flex flex-col gap-0.5 text-sm" key={`${entry.at}-${index}`}>
                        <span>{entry.text}</span>
                        <time className="text-xs text-slate-400" dateTime={entry.at}>
                          {format(entry.at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-base font-semibold">{t('report.object.commentTitle')}</h2>
              <textarea
                className="min-h-24 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"
                maxLength={2000}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              {problem !== undefined ? (
                <p className="text-sm text-rose-400" role="alert">
                  {t(problem)}
                </p>
              ) : null}
              {done !== undefined ? (
                <p className="text-sm text-emerald-300" role="status">
                  {t('report.object.commentDone', { at: format(done) })}
                </p>
              ) : null}
              <button
                className="min-h-11 rounded bg-sky-800 px-3 text-slate-100 disabled:opacity-50"
                disabled={comment.isPending || text.trim() === ''}
                type="button"
                onClick={() => comment.mutate()}
              >
                {t('report.object.commentSubmit')}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
