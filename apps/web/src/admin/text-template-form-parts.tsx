import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { TextTemplateTranslations } from '@stoerdesk/shared'

import { ApiError } from '../lib/api'

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'text_template_not_found',
  'text_template_in_use',
  'text_template_key_taken',
] as const

export const jsonHeaders = { 'content-type': 'application/json' }

export function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.textTemplates.errors.${code}`)
}

export function TranslationFields({
  values,
  onChange,
}: {
  values: TextTemplateTranslations
  onChange: (values: TextTemplateTranslations) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.textTemplates.fields.de')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={200}
          required
          value={values.de}
          onChange={(event) => onChange({ ...values, de: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.textTemplates.fields.en')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          maxLength={200}
          required
          value={values.en}
          onChange={(event) => onChange({ ...values, en: event.target.value })}
        />
      </label>
    </div>
  )
}
