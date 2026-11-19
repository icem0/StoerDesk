import { useCallback, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { ApiError, apiFetch } from '../lib/api'

const jsonHeaders = { 'content-type': 'application/json' }

const MINIMUM_PASSWORD_LENGTH = 12

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'password_wrong',
  'unknown',
] as const

function errorMessage(t: TFunction<'common'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`auth.changePassword.errors.${code}`)
}

/**
 * The dialog of the own password change: the colleague proves knowledge of the
 * current password and enters a new one twice. The server verifies the old
 * password against the stored hash, so a session alone is not enough.
 */
export function PasswordChangeDialog(props: {
  open: boolean
  onClose: () => void
  onChange: () => void
}) {
  const { t } = useTranslation('common')
  const { onClose, onChange } = props
  const inputRef = useRef<HTMLInputElement>(null)

  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repetition, setRepetition] = useState('')

  const lengthOk = password.length >= MINIMUM_PASSWORD_LENGTH
  const repetitionOk = password !== '' && password === repetition

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>('/v1/users/me/password', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ oldPassword, newPassword: password }),
      }),
    onSuccess: () => {
      setOldPassword('')
      setPassword('')
      setRepetition('')
      onClose()
      onChange()
    },
  })

  const disabled =
    oldPassword === '' ||
    password === '' ||
    repetition === '' ||
    !lengthOk ||
    !repetitionOk ||
    mutation.isPending

  const handleClose = useCallback(() => {
    setOldPassword('')
    setPassword('')
    setRepetition('')
    onClose()
  }, [onClose])

  // The panel is closed by unmounting it when `open` is false; focus returns to
  // the button that opened it through `onClose` of the caller.
  if (!props.open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.changePassword.title')}
    >
      <div
        className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <button
          className="absolute right-3 top-3 rounded p-1.5 text-slate-400 hover:text-slate-200"
          onClick={handleClose}
          type="button"
          aria-label={t('back')}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-lg font-semibold">{t('auth.changePassword.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('auth.changePassword.hint')}
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="change-password-old">
              {t('auth.changePassword.fields.oldPassword')}
            </label>
            <input
              id="change-password-old"
              ref={inputRef}
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="change-password-password">
              {t('auth.changePassword.fields.password')}
            </label>
            <input
              id="change-password-password"
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="password"
              autoComplete="new-password"
              minLength={MINIMUM_PASSWORD_LENGTH}
              maxLength={256}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="change-password-repetition">
              {t('auth.changePassword.fields.repetition')}
            </label>
            <input
              id="change-password-repetition"
              className="rounded bg-slate-950 p-2 text-slate-100"
              type="password"
              autoComplete="new-password"
              minLength={MINIMUM_PASSWORD_LENGTH}
              maxLength={256}
              required
              value={repetition}
              onChange={(event) => setRepetition(event.target.value)}
            />
          </div>

          <h3 className="mt-2 mb-1 text-xs font-medium text-slate-500 uppercase">
            {t('auth.changePassword.criteria.heading')}
          </h3>
          <ul className="flex flex-col gap-1 text-xs">
            <li
              className="flex items-center gap-2"
              aria-label={
                lengthOk
                  ? t('auth.changePassword.criteria.met', {
                      criterion: t('auth.changePassword.criteria.length'),
                    })
                  : t('auth.changePassword.criteria.notMet', {
                      criterion: t('auth.changePassword.criteria.length'),
                    })
              }
            >
              <span
                className={`h-3 w-3 rounded-full ${
                  lengthOk
                    ? 'bg-emerald-500'
                    : 'bg-slate-700'
                }`}
                aria-hidden="true"
              />
              {t('auth.changePassword.criteria.length')}
            </li>
          </ul>

          <p className="text-xs text-slate-400">
            {t('auth.changePassword.lengthHint')}
          </p>

          {!lengthOk || !repetitionOk ? (
            <p role="alert" className="mt-1 text-sm text-amber-300">
              {!lengthOk
                ? t('auth.changePassword.tooShort')
                : t('auth.changePassword.mismatch')}
            </p>
          ) : null}

          {mutation.isError ? (
            <p role="alert" className="mt-1 text-sm text-red-400">
              {errorMessage(t, mutation.error)}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              onClick={handleClose}
              type="button"
              disabled={mutation.isPending}
            >
              {t('back')}
            </button>
            <button
              className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
              type="submit"
              disabled={disabled}
            >
              {t('auth.changePassword.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
