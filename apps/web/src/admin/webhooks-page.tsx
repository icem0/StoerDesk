import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  type UpdateWebhookRequest,
  type WebhookEventType,
  type WebhookListResponse,
  type WebhookSummary,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { apiFetch } from '../lib/api'
import {
  EventFields,
  errorCode,
  jsonHeaders,
  toggleEvent,
} from './webhook-form-parts'

/**
 * Admin webhook page (`specs/08-objects-api.md` §9.5, WP-M10-11).
 * The signing secret is shown once in the create panel and never listed again.
 * Since WP-M16-20c the actions of a row sit behind the shared row menu
 * (ADR-0043).
 */

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
          className="min-h-11 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
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
          <RowMenu
            items={[
              {
                key: 'edit',
                label: t('webhooks.edit'),
                onSelect: () => setEditing(true),
              },
              {
                key: 'delete',
                label: t('webhooks.delete'),
                tone: 'danger',
                onSelect: () => setConfirming(true),
              },
            ]}
          />
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
          {mayWrite ? (
            <Link
              className="inline-flex min-h-11 items-center self-start rounded bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              to="/admin/webhooks/new"
            >
              {t('webhooks.createTitle')}
            </Link>
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
