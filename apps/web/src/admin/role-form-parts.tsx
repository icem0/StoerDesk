import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PERMISSION_KEYS } from '@stoerdesk/shared'

import { ApiError } from '../lib/api'

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'role_not_found',
  'role_key_taken',
  'system_role_protected',
  'role_in_use',
  'unknown_permission_key',
] as const

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.roles.errors.${code}`)
}

export function PermissionCheckboxes({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm text-slate-400">
        {t('admin.roles.fields.permissionsLabel')}
      </legend>
      <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto border border-slate-700 rounded p-2">
        {PERMISSION_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() => onToggle(key)}
            />
            {key}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function toggleKey(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]
}
