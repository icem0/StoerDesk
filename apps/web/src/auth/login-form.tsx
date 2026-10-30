import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { loginRequestSchema } from '@stoerdesk/shared'
import type { LoginRequest, MeResponse } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../lib/api'

/**
 * Login error codes of `specs/01-rbac.md` §3.6. Unknown account, wrong password and a
 * deactivated account all arrive as `invalid_credentials`, so the UI can never reveal
 * whether an account exists.
 */
const handledErrorCodes = [
  'invalid_credentials',
  'rate_limited',
  'invalid_request',
  'session_invalid',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`auth.errors.${code}`)
}

/**
 * E-mail and password form for `POST /api/v1/auth/login` (WP-M1-09e). A successful
 * login writes the `/me` payload of the login response into the `['me']` cache, so the
 * guarded area re-renders without a second round-trip.
 */
export function LoginForm() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<LoginRequest>({ email: '', password: '' })
  const [fieldsInvalid, setFieldsInvalid] = useState(false)

  const mutation = useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<MeResponse>('/v1/auth/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setValues({ email: '', password: '' })
    },
  })

  return (
    <form
      className="mt-4 flex max-w-sm flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        // Client-side parse only produces the field hint; the server normalizes and
        // validates the same schema again (`specs/01-rbac.md` §3.6).
        const parsed = loginRequestSchema.safeParse(values)

        if (!parsed.success) {
          setFieldsInvalid(true)

          return
        }

        setFieldsInvalid(false)
        mutation.mutate(parsed.data)
      }}
    >
      <h2 className="text-lg font-semibold">{t('auth.title')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('auth.fields.email')}
        <input
          className="rounded bg-slate-900 p-2 text-slate-100"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('auth.fields.password')}
        <input
          className="rounded bg-slate-900 p-2 text-slate-100"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
      </label>
      {fieldsInvalid ? (
        <p role="alert" className="text-sm text-amber-300">
          {t('auth.invalidHint')}
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <button
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={mutation.isPending}
      >
        {t('auth.submit')}
      </button>
    </form>
  )
}

/**
 * Ends the session through `POST /api/v1/auth/logout` (answers `204` even without a
 * session) and drops the cached admin queries, so no user or role data stays in the
 * client cache behind a signed-out shell.
 */
export function LogoutButton() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiFetch('/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      for (const queryKey of [['me'], ['users'], ['roles']] as const) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })

  return (
    <button
      className="self-start rounded border border-slate-600 px-3 py-1 text-sm disabled:opacity-50"
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {t('auth.logout')}
    </button>
  )
}
