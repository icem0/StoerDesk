import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { type CreateWebhookResponse, type WebhookEventType } from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { EventFields, errorCode, jsonHeaders, toggleEvent } from './webhook-form-parts'

/**
 * The own page of the new webhook (WP-M14-165): the form does not lie above
 * the list of the webhooks any more, the list offers a button that opens this
 * page. The signing secret is shown here once — the server answers it only
 * once.
 */

function SecretPanel(props: { secret: string; url: string; onClose: () => void }) {
  const { t } = useTranslation('settings')
  const [copied, setCopied] = useState(false)

  return (
    <section className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4">
      <h2 className="text-lg font-semibold text-emerald-200">{t('webhooks.secretTitle')}</h2>
      <p className="mt-1 text-sm text-emerald-100/80">
        {t('webhooks.secretHint', { url: props.url })}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-2 text-sm text-slate-100">
          {props.secret}
        </code>
        <button
          className="min-h-11 rounded-lg border border-emerald-600 px-3 text-sm text-emerald-100 hover:bg-emerald-900/40"
          onClick={() => {
            void navigator.clipboard.writeText(props.secret).then(() => setCopied(true))
          }}
          type="button"
        >
          {copied ? t('webhooks.copied') : t('webhooks.copy')}
        </button>
        <button
          className="min-h-11 rounded-lg border border-emerald-800 px-3 text-sm text-emerald-200 hover:bg-emerald-900/40"
          onClick={props.onClose}
          type="button"
        >
          {t('webhooks.close')}
        </button>
      </div>
    </section>
  )
}

export function WebhookCreatePage() {
  const { t } = useTranslation('settings')
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<CreateWebhookResponse | null>(null)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<WebhookEventType[]>(['ticket.created'])
  const [active, setActive] = useState(true)

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateWebhookResponse>('/v1/webhooks', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ url, events, active }),
      }),
    onSuccess: (answer) => {
      setCreated(answer)
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  if (!mayWrite) {
    return (
      <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
        {t('webhooks.readOnly')}
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/admin/webhooks"
      >
        {t('webhooks.title')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('webhooks.createTitle')}</h1>
      </div>
      {created === null ? null : (
        <SecretPanel
          onClose={() => setCreated(null)}
          secret={created.secret}
          url={created.webhook.url}
        />
      )}
      <form
        className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('webhooks.url')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t('webhooks.urlPlaceholder')}
            required
            type="url"
            value={url}
          />
        </label>
        <EventFields
          events={events}
          onToggle={(event) => setEvents((current) => toggleEvent(current, event))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
          {t('webhooks.activeLabel')}
        </label>
        {mutation.isError ? (
          <p className="text-sm text-rose-400" role="alert">
            {t(`webhooks.errors.${errorCode(mutation.error)}`)}
          </p>
        ) : null}
        <button
          className="min-h-11 self-start rounded-lg bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
          disabled={mutation.isPending || url.trim() === '' || events.length === 0}
          type="submit"
        >
          {t('webhooks.create')}
        </button>
      </form>
    </section>
  )
}
