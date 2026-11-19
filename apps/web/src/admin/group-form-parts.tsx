import type { TFunction } from 'i18next'

import { ApiError } from '../lib/api'

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'group_not_found',
  'group_name_taken',
  'group_in_use',
] as const

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.groups.errors.${code}`)
}
