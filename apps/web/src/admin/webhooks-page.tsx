import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  type CreateWebhookResponse,
  type UpdateWebhookRequest,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type WebhookListResponse,
  type WebhookSummary,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Admin webhook page (`specs/08-objects-api.md` §9.5, WP-M10-11).
 * The signing secret is shown once in the create panel and never listed again.
 */

const jsonHeaders = { 'content-type': 'application/json' }

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

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

function EventFields(props: {
  events: WebhookEventType[]
  onToggle: (event: WebhookEventType) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm text-slate-300">{t('webhooks.events')}</legend>
      {WEBHOOK_EVENT_TYPES.map((event) => (
        <label className="flex items-center gap-2 text-sm" key={event}>
          <input
            checked={props.events.includes(event)}
            onChange={() => props.onToggle(event)}
            type="checkbox"
          />
          {t(`webhooks.eventLabels.${event}`)}
        </label>
      ))}
    </fieldset>
  )
}

function toggleEvent(current: WebhookEventType[], event: WebhookEventType): WebhookEventType[] {
  return current.includes(event) ? current.filter((entry) => entry !== event) : [...current, event]
}

function CreateForm(props: { onCreated: (answer: CreateWebhookResponse) => void }) {
  const { t } = useTranslation('settings')
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
      setUrl('')
      setEvents(['ticket.created'])
      setActive(true)
      props.onCreated(answer)
    },
  })

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <h2 className="text-lg font-semibold">{t('webhooks.createTitle')}</h2>
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
      <EventFields events={events} onToggle={(event) => setEvents((current) => toggleEvent(current, event))} />
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
        className="min-h-11 self-start rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        disabled={mutation.isPending || url.trim() === '' || events.length === 0}
        type="submit"
      >
        {t('webhooks.create')}
      </button>
    </form>
  )
}

function EditForm(props: { entry: WebhookSummary; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation('settings')
  const [url, setUrl] = useState(props.entry.url)
  const [events, setEvents] = useState<WebhookEventType[]>(props.entry.events)
  const [active, setActive] = useState(props.entry.active)

  const mutation = useMutation({
    mutationFn: (body: UpdateWebhookRequest) =>
      apiFetch<WebhookSummary>(`/v1/webhooks/${props.entry.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: props.onSaved,
  })

  return (
    <form
      className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/40 py-3 last:border-b-0"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ url, events, active })
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('webhooks.url')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={2048}
          onChange={(event) => setUrl(event.target.value)}
          required
          type="url"
          value={url}
        />
      </label>
      <EventFields events={events} onToggle={(event) => setEvents((current) => toggleEvent(current, event))} />
      <label className="flex items-center gap-2 text-sm">
        <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
        {t('webhooks.activeLabel')}
      </label>
      {mutation.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`webhooks.errors.${errorCode(mutation.error)}`)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="min-h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          disabled={mutation.isPending || url.trim() === '' || events.length === 0}
          type="submit"
        >
          {t('webhooks.save')}
        </button>
        <button
          className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm"
          onClick={props.onCancel}
          type="button"
        >
          {t('webhooks.cancel')}
        </button>
      </div>
    </form>
  )
}

function WebhookRow(props: {
  entry: WebhookSummary
  mayWrite: boolean
  onDelete: (id: string) => void
  onSaved: () => void
}) {
  const { t } = useTranslation('settings')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (editing) {
    return (
      <li>
        <EditForm
          entry={props.entry}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            props.onSaved()
          }}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 border-b border-slate-800 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-all font-medium">{props.entry.url}</p>
        <p className="text-xs text-slate-400">
          {props.entry.events.map((event) => t(`webhooks.eventLabels.${event}`)).join(', ')}
        </p>
        <p className="text-xs text-slate-500">
          {props.entry.active ? t('webhooks.activeBadge') : t('webhooks.inactiveBadge')}
        </p>
      </div>
      {props.mayWrite ? (
        confirming ? (
          <div className="flex gap-2">
            <button
              className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500"
              onClick={() => props.onDelete(props.entry.id)}
              type="button"
            >
              {t('webhooks.deleteConfirm')}
            </button>
            <button
              className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm"
              onClick={() => setConfirming(false)}
              type="button"
            >
              {t('webhooks.cancel')}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              className="min-h-11 self-start rounded-lg border border-slate-600 px-3 text-sm hover:bg-slate-800"
              onClick={() => setEditing(true)}
              type="button"
            >
              {t('webhooks.edit')}
            </button>
            <button
              className="min-h-11 self-start rounded-lg border border-rose-700 px-3 text-sm text-rose-300 hover:bg-rose-950/40"
              onClick={() => setConfirming(true)}
              type="button"
            >
              {t('webhooks.delete')}
            </button>
          </div>
        )
      ) : null}
    </li>
  )
}

export function WebhooksPage() {
  const { t } = useTranslation('settings')
  const mayRead = usePermission('settings.read')
  const mayWrite = usePermission('settings.write')
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<CreateWebhookResponse | null>(null)

  const query = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiFetch<WebhookListResponse>('/v1/webhooks'),
    enabled: mayRead,
    retry: false,
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
  }

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('webhooks.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('webhooks.hint')}</p>
      </div>

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('webhooks.errors.forbidden')}
        </p>
      ) : (
        <>
          {created === null ? null : (
            <SecretPanel
              onClose={() => setCreated(null)}
              secret={created.secret}
              url={created.webhook.url}
            />
          )}
          {mayWrite ? (
            <CreateForm
              onCreated={(answer) => {
                setCreated(answer)
                refresh()
              }}
            />
          ) : (
            <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
              {t('webhooks.readOnly')}
            </p>
          )}
          <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{t('webhooks.listTitle')}</h2>
            {query.isPending ? (
              <p className="mt-2 text-sm text-slate-400">{t('webhooks.loading')}</p>
            ) : query.isError ? (
              <p className="mt-2 text-sm text-rose-400" role="alert">
                {t(`webhooks.errors.${errorCode(query.error)}`)}
              </p>
            ) : query.data.webhooks.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t('webhooks.empty')}</p>
            ) : (
              <ul className="mt-2">
                {query.data.webhooks.map((entry) => (
                  <WebhookRow
                    entry={entry}
                    key={entry.id}
                    mayWrite={mayWrite}
                    onDelete={(id) => remove.mutate(id)}
                    onSaved={refresh}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
