import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { ApiError, apiFetch } from '../lib/api'
import { HelpPopover } from '../components/help-popover'
import { helpTriggerClass } from '../components/help-trigger'

/**
 * The form of the own password (`specs/01-rbac.md` §3.9, ADR-0031): the
 * administration handed over a one-time password, and the colleague replaces it
 * with a secret of his own before the app opens.
 *
 * The form sends `PATCH /api/v1/users/me` with the `password` — the route
 * clears the flag of the account and ends the sessions of the other devices.
 * The repetition must match the first field in the browser; the server knows
 * only the one password.
 */

const jsonHeaders = { 'content-type': 'application/json' }

const handledErrorCodes = [
  'invalid_request',
  'session_invalid',
  'password_change_required',
  'unknown',
] as const

const MINIMUM_PASSWORD_LENGTH = 12

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`auth.passwordChange.errors.${code}`)
}

export function PasswordChangeForm() {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [repetition, setRepetition] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [tooShort, setTooShort] = useState(false)

  const mutation = useMutation({
    mutationFn: (value: string) =>
      apiFetch('/v1/users/me', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ password: value }),
      }),
    onSuccess: () => {
      setPassword('')
      setRepetition('')
      setMismatch(false)
      setTooShort(false)
      // The flag of the account is gone; the new answer of `/me` opens the app.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-700 bg-slate-900/50 p-6 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault()

          if (password.length < MINIMUM_PASSWORD_LENGTH) {
            setTooShort(true)

            return
          }

          if (password !== repetition) {
            setMismatch(true)

            return
          }

          setTooShort(false)
          setMismatch(false)
          mutation.mutate(password)
        }}
      >
        <div className="flex items-center justify-center gap-1">
          <h2 className="text-center text-lg font-semibold">{t('auth.passwordChange.title')}</h2>
          <HelpPopover
            className={helpTriggerClass}
            label={t('help:triggerFor', { name: t('auth.passwordChange.title') })}
            text={t('auth.passwordChange.hint')}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="password-change-password">{t('auth.passwordChange.fields.password')}</label>
          <input
            id="password-change-password"
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            maxLength={256}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="password-change-repetition">
            {t('auth.passwordChange.fields.repetition')}
          </label>
          <input
            id="password-change-repetition"
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="password"
            name="repetition"
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            maxLength={256}
            required
            value={repetition}
            onChange={(event) => setRepetition(event.target.value)}
          />
        </div>
        <p className="text-xs text-slate-400">{t('auth.passwordChange.lengthHint')}</p>
        {tooShort ? (
          <p role="alert" className="text-center text-sm text-amber-300">
            {t('auth.passwordChange.tooShort')}
          </p>
        ) : null}
        {mismatch ? (
          <p role="alert" className="text-center text-sm text-amber-300">
            {t('auth.passwordChange.mismatch')}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-center text-sm text-red-400">
            {errorMessage(t, mutation.error)}
          </p>
        ) : null}
        <button
          className="w-full rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('auth.passwordChange.submit')}
        </button>
      </form>
    </div>
  )
}
