import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  API_KEY_SCOPES,
  type ApiKeyScope,
  type CreateApiKeyResponse,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The own page of the new API key (WP-M14-164): the form does not lie above
 * the list of the keys any more, the list offers a button that opens this
 * page. The plaintext token is shown here once — the server answers it only
 * once.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function errorCode(error: unknown): string {
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

export function ApiKeyCreatePage() {
  const { t } = useTranslation('settings')
  const mayWrite = usePermission('apikey.write')
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null)
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
      setCreated(answer)
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  function toggle(scope: ApiKeyScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    )
  }

  if (!mayWrite) {
    return (
      <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
        {t('apiKeys.readOnly')}
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <Link
        className="inline-flex min-h-11 items-center self-start rounded bg-slate-800 px-3 text-sm hover:bg-slate-700"
        to="/admin/api-keys"
      >
        {t('apiKeys.title')}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t('apiKeys.createTitle')}</h1>
      </div>
      {created === null ? null : (
        <TokenPanel
          name={created.key.name}
          onClose={() => setCreated(null)}
          token={created.token}
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
    </section>
  )
}
