import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { MeResponse } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../../lib/api'

/**
 * The sign in of the customer portal (`specs/19-customer-portal.md` §19.3,
 * §19.4, ADR-0054): the three tabs „Anmelden“, „Registrieren“ und „Passwort
 * vergessen“.
 *
 * The page lies outside the shell of the app — a customer never sees the menu
 * of the office. The registration exists only when the instance has a mailbox;
 * the page asks the server before it offers the tab.
 */

type Tab = 'login' | 'register' | 'reset'

const jsonHeaders = { 'content-type': 'application/json' }

interface Availability {
  available: boolean
}

export function PortalAuthPage() {
  const { t } = useTranslation('customer')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const availability = useQuery({
    queryKey: ['customer', 'registration'],
    queryFn: () => apiFetch<Availability>('/v1/public/auth/registration'),
    retry: false,
  })

  const login = useMutation({
    mutationFn: () =>
      apiFetch<MeResponse>('/v1/auth/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/portal/tickets')
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  const register = useMutation({
    mutationFn: () =>
      apiFetch<unknown>('/v1/public/auth/register', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email, givenName, familyName }),
      }),
    onSuccess: () => {
      setError(null)
      setNotice(t('auth.register.sent', { email }))
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  const reset = useMutation({
    mutationFn: () =>
      apiFetch<unknown>('/v1/public/auth/password-reset', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email }),
      }),
    onSuccess: () => {
      setError(null)
      setNotice(t('auth.reset.sent'))
    },
    onError: (known: unknown) => {
      setError(known instanceof ApiError ? (known.code ?? 'internal_error') : 'internal_error')
    },
  })

  const registerAvailable = availability.data?.available === true

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (tab === 'login') {
      login.mutate()
      return
    }

    if (tab === 'register') {
      register.mutate()
      return
    }

    reset.mutate()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
      <p className="text-sm text-slate-600">{t('auth.hint')}</p>

      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'login'}
          className={
            tab === 'login'
              ? 'rounded bg-slate-800 px-3 py-1 text-sm text-white'
              : 'rounded border border-slate-300 px-3 py-1 text-sm'
          }
          onClick={() => setTab('login')}
        >
          {t('auth.tabs.login')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'register'}
          disabled={!registerAvailable}
          className={
            tab === 'register'
              ? 'rounded bg-slate-800 px-3 py-1 text-sm text-white'
              : 'rounded border border-slate-300 px-3 py-1 text-sm'
          }
          onClick={() => setTab('register')}
        >
          {t('auth.tabs.register')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reset'}
          className={
            tab === 'reset'
              ? 'rounded bg-slate-800 px-3 py-1 text-sm text-white'
              : 'rounded border border-slate-300 px-3 py-1 text-sm'
          }
          onClick={() => setTab('reset')}
        >
          {t('auth.tabs.reset')}
        </button>
      </div>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-sm">
          {t('auth.fields.email')}
          <input
            type="email"
            autoComplete="email"
            className="rounded border border-slate-300 px-2 py-1"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {tab === 'login' ? (
          <label className="flex flex-col gap-1 text-sm">
            {t('auth.fields.password')}
            <input
              type="password"
              autoComplete="current-password"
              className="rounded border border-slate-300 px-2 py-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        ) : null}

        {tab === 'register' ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              {t('auth.fields.givenName')}
              <input
                autoComplete="given-name"
                className="rounded border border-slate-300 px-2 py-1"
                value={givenName}
                onChange={(event) => setGivenName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('auth.fields.familyName')}
              <input
                autoComplete="family-name"
                className="rounded border border-slate-300 px-2 py-1"
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
              />
            </label>
            <p className="text-xs text-slate-500">{t('auth.register.hint')}</p>
          </>
        ) : null}

        <button
          type="submit"
          className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={login.isPending || register.isPending || reset.isPending || email === ''}
        >
          {tab === 'login'
            ? login.isPending
              ? t('auth.login.submitting')
              : t('auth.login.submit')
            : tab === 'register'
              ? register.isPending
                ? t('auth.register.submitting')
                : t('auth.register.submit')
              : reset.isPending
                ? t('auth.reset.submitting')
                : t('auth.reset.submit')}
        </button>
      </form>

      {tab === 'register' && !registerAvailable ? (
        <p className="text-sm text-slate-600">{t('auth.register.unavailable')}</p>
      ) : null}

      {notice !== null ? <p className="text-sm text-slate-700">{notice}</p> : null}

      {error !== null ? (
        <p className="text-sm text-red-700" role="alert">
          {t(`auth.errors.${error}`)}
        </p>
      ) : null}
    </main>
  )
}
