import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { ApiError, apiFetch } from '../lib/api'

const jsonHeaders = { 'content-type': 'application/json' }

type UserLocale = 'de' | 'en'
type UserTheme = 'auto' | 'light' | 'dark'

interface MySettingsFormValues {
  givenName: string
  familyName: string
  locale: UserLocale
  theme: UserTheme
  password: string
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'unknown',
] as const

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`my.errors.${code}`)
}

export function MySettingsPage() {
  const { t } = useTranslation('common')
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        user: {
          id: string
          email: string
          givenName: string
          familyName: string
          locale: UserLocale
          theme: UserTheme
        }
      }>('/v1/me'),
    retry: false,
  })

  const [values, setValues] = useState<MySettingsFormValues>({
    givenName: me.data?.user.givenName ?? '',
    familyName: me.data?.user.familyName ?? '',
    locale: me.data?.user.locale ?? 'de',
    theme: me.data?.user.theme ?? 'auto',
    password: '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}

      if (values.givenName !== '') {
        body.givenName = values.givenName
      }
      if (values.familyName !== '') {
        body.familyName = values.familyName
      }
      body.locale = values.locale
      body.theme = values.theme
      if (values.password !== '') {
        body.password = values.password
      }

      return apiFetch<{ user: { id: string } }>('/v1/users/me', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
    },
  })

  if (me.isPending) {
    return <p>{t('auth.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-400">
        {t('auth.errors.session_invalid')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 sm:p-8 text-slate-100">
      <Link
        className="mt-6 inline-block rounded bg-slate-800 px-3 py-2 text-sm transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin"
      >
        {t('branding.back')}
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">{t('my.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {t('auth.signedInAs', { email: me.data?.user.email ?? '' })}
      </p>

      {mutation.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}

      <form
        className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('my.fields.givenName')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="text"
            maxLength={64}
            value={values.givenName}
            onChange={(event) =>
              setValues({ ...values, givenName: event.target.value.trim() })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('my.fields.familyName')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="text"
            maxLength={64}
            value={values.familyName}
            onChange={(event) =>
              setValues({ ...values, familyName: event.target.value.trim() })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('my.fields.locale')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            value={values.locale}
            onChange={(event) =>
              setValues({ ...values, locale: event.target.value as UserLocale })}
          >
            <option value="de">{t('my.locales.de')}</option>
            <option value="en">{t('my.locales.en')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('my.fields.theme')}
          <select
            className="rounded bg-slate-950 p-2 text-slate-100"
            name="theme"
            value={values.theme}
            onChange={(event) =>
              setValues({ ...values, theme: event.target.value as UserTheme })}
          >
            <option value="auto">{t('my.themeValues.auto')}</option>
            <option value="light">{t('my.themeValues.light')}</option>
            <option value="dark">{t('my.themeValues.dark')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('my.fields.password')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="password"
            minLength={12}
            maxLength={256}
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
        </label>
        <div className="flex gap-2">
          <button
            className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={mutation.isPending}
          >
            {t('my.save')}
          </button>
          {mutation.isSuccess ? (
            <p className="mt-1 text-sm text-emerald-400">{t('my.saved')}</p>
          ) : null}
        </div>
      </form>
    </main>
  )
}
