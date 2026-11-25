import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { RoleListResponse } from '@stoerdesk/shared'

import { ApiError, apiFetch } from '../lib/api'

export type UserLocale = 'de' | 'en'
export type UserTheme = 'auto' | 'light' | 'dark'

export interface UserFormValues {
  email: string
  password: string
  givenName: string
  familyName: string
  locale: UserLocale
  theme: UserTheme
  active: boolean
  roleKeys: string[]
}

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'email_taken',
  'last_admin',
  'unknown_role_key',
  'user_not_found',
] as const

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.users.errors.${code}`)
}

export function useRoles(enabled: boolean) {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<RoleListResponse>('/v1/roles'),
    retry: false,
    enabled,
  })
}

export function RoleCheckboxes({
  selected,
  roleKeys,
  onToggle,
}: {
  selected: string[]
  roleKeys: string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="mb-1 text-sm text-slate-400">{t('admin.users.fields.rolesLabel')}</legend>
      {roleKeys.map((key) => (
        <label key={key} className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={selected.includes(key)} onChange={() => onToggle(key)} />
          {t(`admin.roles.keys.${key}`, { defaultValue: key })}
        </label>
      ))}
      <p className="mt-2 text-xs text-slate-500">{t('admin.users.fields.customerHint')}</p>
    </fieldset>
  )
}
