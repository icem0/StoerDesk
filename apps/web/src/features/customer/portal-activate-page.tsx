import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import type { CustomerTokenAnswer } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * The activation of an account (`specs/19-customer-portal.md` §19.3,
 * ADR-0054): the page of the link of the mail. It shows the address of the
 * account and the field of the new password.
 *
 * The page lies outside the shell of the app — the visitor of the link has no
 * session.
 */

const jsonHeaders = { 'content-type': 'application/json' }

export function PortalActivatePage() {
  const { t } = useTranslation('customer')
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tokenQuery = useQuery({
    queryKey: ['customer', 'token', token],
    queryFn: () => apiFetch<CustomerTokenAnswer>(`/v1/public/auth/token/${token ?? ''}`),
    enabled: token !== undefined,
    retry: false,
  })

  const save = useMutation({
    mutationFn: () =>
      apiFetch<unknown>(`/v1/public/auth/token/${token ?? ''}/password`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      setError(null)
      setDone(true)
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{t('auth.activate.title')}</h1>
      <p className="text-sm text-slate-600">{t('auth.activate.hint')}</p>

      {tokenQuery.data !== undefined ? (
        <p className="text-sm text-slate-700">{tokenQuery.data.email}</p>
      ) : null}

      {done ? (
        <p className="text-sm text-slate-700">{t('auth.activate.done')}</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            save.mutate()
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t('auth.fields.newPassword')}
            <input
              type="password"
              autoComplete="new-password"
              className="rounded border border-slate-300 px-2 py-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={save.isPending || password.length < 12}
          >
            {save.isPending ? t('auth.activate.submitting') : t('auth.activate.submit')}
          </button>
        </form>
      )}

      {error !== null ? (
        <p className="text-sm text-red-700" role="alert">
          {t(`auth.errors.${error}`)}
        </p>
      ) : null}

      {tokenQuery.isError ? (
        <p className="text-sm text-red-700" role="alert">
          {t('auth.activate.forbidden')}
        </p>
      ) : null}
    </main>
  )
}
