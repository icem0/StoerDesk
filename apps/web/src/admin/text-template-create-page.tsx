import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type {
  CreateTextTemplateRequest,
  TextTemplateSummary,
  TextTemplateTranslations,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { TranslationFields, errorMessage, jsonHeaders } from './text-template-form-parts'
import { AdminLayout } from '../components/admin-layout'

/**
 * The own page of the new fault type (WP-M14-162): the form does not lie
 * above the list of the fault types any more, the list offers a button that
 * opens this page.
 */
export function TextTemplateCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('settings.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [key, setKey] = useState('')
  const [values, setValues] = useState<TextTemplateTranslations>({ de: '', en: '' })

  const mutation = useMutation({
    mutationFn: (body: CreateTextTemplateRequest) =>
      apiFetch<TextTemplateSummary>('/v1/text-templates', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
      navigate('/admin/text-templates')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.textTemplates.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.textTemplates.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.textTemplates.forbiddenNotice')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/text-templates"
      >
        {t('admin.textTemplates.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.textTemplates.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ key, translations: values })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.textTemplates.fields.key')}
          <input
            className="rounded bg-slate-950 p-2 text-slate-100"
            type="text"
            required
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <TranslationFields values={values} onChange={setValues} />
        {mutation.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage(t, mutation.error)}
          </p>
        ) : null}
        <button
          className="self-start rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.textTemplates.create')}
        </button>
      </form>
    </AdminLayout>
  )
}
