import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  API_KEY_SCOPES,
  type ApiKeyListResponse,
  type ApiKeyScope,
  type ApiKeySummary,
  type CreateApiKeyResponse,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Admin API-key page (`specs/08-objects-api.md` §9.5, WP-M10-04).
 * The plaintext token is shown once in the create panel and never listed again.
 */

const jsonHeaders = { 'content-type': 'application/json' }

function errorCode(error: unknown): string {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : 'unknown'
}

function TokenPanel(props: { token: string; name: string; onClose: () => void }) {
  const { t } = useTranslation('settings')
  const [copied, setCopied] = useState(false)

  return (
    <section className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4">
      <h2 className="text-lg font-semibold text-emerald-200">{t('apiKeys.tokenTitle')}</h2>
      <p className="mt-1 text-sm text-emerald-100/80">{t('apiKeys.tokenHint', { name: props.name })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-slate-950 p-2 text-sm text-slate-100">
          {props.token}
        </code>
        <button
          className="min-h-11 rounded-lg border border-emerald-600 px-3 text-sm text-emerald-100 hover:bg-emerald-900/40"
          onClick={() => {
            void navigator.clipboard.writeText(props.token).then(() => setCopied(true))
          }}
          type="button"
        >
          {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
        </button>
        <button
          className="min-h-11 rounded-lg border border-emerald-800 px-3 text-sm text-emerald-200 hover:bg-emerald-900/40"
          onClick={props.onClose}
          type="button"
        >
          {t('apiKeys.close')}
        </button>
      </div>
    </section>
  )
}

function CreateForm(props: { onCreated: (answer: CreateApiKeyResponse) => void }) {
  const { t } = useTranslation('settings')
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['objects:read'])
  const [expiresAt, setExpiresAt] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateApiKeyResponse>('/v1/api-keys', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name,
          scopes,
          expiresAt: expiresAt === '' ? null : new Date(expiresAt).toISOString(),
        }),
      }),
    onSuccess: (answer) => {
      setName('')
      setScopes(['objects:read'])
      setExpiresAt('')
      props.onCreated(answer)
    },
  })

  function toggle(scope: ApiKeyScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    )
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <h2 className="text-lg font-semibold">{t('apiKeys.createTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('apiKeys.name')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-slate-300">{t('apiKeys.scopes')}</legend>
        {API_KEY_SCOPES.map((scope) => (
          <label className="flex items-center gap-2 text-sm" key={scope}>
            <input checked={scopes.includes(scope)} onChange={() => toggle(scope)} type="checkbox" />
            {t(`apiKeys.scopeLabels.${scope}`)}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t('apiKeys.expiresAt')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          onChange={(event) => setExpiresAt(event.target.value)}
          type="date"
          value={expiresAt}
        />
      </label>
      {mutation.isError ? (
        <p className="text-sm text-rose-400" role="alert">
          {t(`apiKeys.errors.${errorCode(mutation.error)}`)}
        </p>
      ) : null}
      <button
        className="min-h-11 self-start rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        disabled={mutation.isPending || name.trim() === '' || scopes.length === 0}
        type="submit"
      >
        {t('apiKeys.create')}
      </button>
    </form>
  )
}

function KeyRow(props: { entry: ApiKeySummary; mayWrite: boolean; onRevoke: (id: string) => void }) {
  const { t } = useTranslation('settings')
  const [confirming, setConfirming] = useState(false)
  const revoked = props.entry.revokedAt !== null

  return (
    <li className="flex flex-col gap-2 border-b border-slate-800 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">
          {props.entry.name}{' '}
          <span className="font-mono text-xs text-slate-400">{props.entry.prefix}…</span>
        </p>
        <p className="text-xs text-slate-400">{props.entry.scopes.join(', ')}</p>
        <p className="text-xs text-slate-500">
          {props.entry.lastUsedAt === null
            ? t('apiKeys.neverUsed')
            : t('apiKeys.lastUsed', { date: new Date(props.entry.lastUsedAt).toLocaleString() })}
          {props.entry.expiresAt === null
            ? ''
            : ` · ${t('apiKeys.expires', { date: new Date(props.entry.expiresAt).toLocaleDateString() })}`}
        </p>
      </div>
      {revoked ? (
        <span className="text-xs text-rose-300">{t('apiKeys.revoked')}</span>
      ) : props.mayWrite ? (
        confirming ? (
          <div className="flex gap-2">
            <button
              className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500"
              onClick={() => props.onRevoke(props.entry.id)}
              type="button"
            >
              {t('apiKeys.revokeConfirm')}
            </button>
            <button
              className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm"
              onClick={() => setConfirming(false)}
              type="button"
            >
              {t('apiKeys.cancel')}
            </button>
          </div>
        ) : (
          <button
            className="min-h-11 self-start rounded-lg border border-rose-700 px-3 text-sm text-rose-300 hover:bg-rose-950/40"
            onClick={() => setConfirming(true)}
            type="button"
          >
            {t('apiKeys.revoke')}
          </button>
        )
      ) : null}
    </li>
  )
}

export function ApiKeysPage() {
  const { t } = useTranslation('settings')
  const mayRead = usePermission('apikey.read')
  const mayWrite = usePermission('apikey.write')
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null)

  const query = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKeyListResponse>('/v1/api-keys'),
    enabled: mayRead,
    retry: false,
  })

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/admin"
      >
        {t('admin.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('apiKeys.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('apiKeys.hint')}</p>
      </div>

      {!mayRead ? (
        <p className="text-sm text-rose-400" role="alert">
          {t('apiKeys.errors.forbidden')}
        </p>
      ) : (
        <>
          {created === null ? null : (
            <TokenPanel
              name={created.key.name}
              onClose={() => setCreated(null)}
              token={created.token}
            />
          )}
          {mayWrite ? (
            <CreateForm
              onCreated={(answer) => {
                setCreated(answer)
                void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
              }}
            />
          ) : (
            <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
              {t('apiKeys.readOnly')}
            </p>
          )}
          <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold">{t('apiKeys.listTitle')}</h2>
            {query.isPending ? (
              <p className="mt-2 text-sm text-slate-400">{t('apiKeys.loading')}</p>
            ) : query.isError ? (
              <p className="mt-2 text-sm text-rose-400" role="alert">
                {t(`apiKeys.errors.${errorCode(query.error)}`)}
              </p>
            ) : query.data.keys.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t('apiKeys.empty')}</p>
            ) : (
              <ul className="mt-2">
                {query.data.keys.map((entry) => (
                  <KeyRow
                    entry={entry}
                    key={entry.id}
                    mayWrite={mayWrite}
                    onRevoke={(id) => revoke.mutate(id)}
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
