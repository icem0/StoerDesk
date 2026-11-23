import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  type ApiKeyListResponse,
  type ApiKeySummary,
} from '@stoerdesk/shared'

import { usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { errorCode } from './api-key-create-page'

/**
 * Admin API-key page (`specs/08-objects-api.md` §9.5, WP-M10-04).
 * The plaintext token is shown once in the create panel and never listed again.
 */

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
        to="/settings"
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
          {mayWrite ? (
            <Link
              className="inline-flex min-h-11 items-center self-start rounded bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              to="/admin/api-keys/new"
            >
              {t('apiKeys.createTitle')}
            </Link>
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
