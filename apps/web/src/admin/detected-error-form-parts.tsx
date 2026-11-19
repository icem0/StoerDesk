import type { TFunction } from 'i18next'

import { ApiError } from '../lib/api'

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'detected_error_not_found',
  'detected_error_in_use',
  'detected_error_key_taken',
] as const

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`detectedErrors.errors.${code}`)
}
