import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import type {
  CreateTextTemplateRequest,
  TextTemplateListResponse,
  TextTemplateSummary,
  TextTemplateTranslations,
  UpdateTextTemplateRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Fault type administration (`specs/06-report-form.md` §7.9, WP-M2-40c).
 *
 * The catalog of the report form: create a template with a German/English pair,
 * edit it, archive it (it disappears from the form but keeps labelling existing
 * tickets) and delete it only while no ticket carries it. The server enforces
 * `settings.read`/`settings.write`; the UI only hides what the role may not do.
 */

const handledErrorCodes = [
  'session_invalid',
  'forbidden',
  'invalid_request',
  'text_template_not_found',
  'text_template_in_use',
  'text_template_key_taken',
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.textTemplates.errors.${code}`)
}

function useTextTemplates() {
  return useQuery({
    queryKey: ['text-templates'],
    queryFn: () => apiFetch<TextTemplateListResponse>('/v1/text-templates'),
    retry: false,
  })
}

/**
 * The management list stays alphabetical by key (WP-M10-20b). The catalog endpoint is
 * now frequency-ordered to serve the report and office forms (WP-M10-20), so the
 * administration table re-sorts its own rows and keeps the predictable key order.
 */
function alphabeticalTemplates(templates: TextTemplateSummary[]): TextTemplateSummary[] {
  return [...templates].sort((a, b) => a.key.localeCompare(b.key))
}

function TranslationFields({
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

function CreateTemplateForm() {
  const { t } = useTranslation('settings')
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
      setKey('')
      setValues({ de: '', en: '' })
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ key, translations: values })
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.textTemplates.createTitle')}</h2>
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
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={mutation.isPending}
      >
        {t('admin.textTemplates.create')}
      </button>
    </form>
  )
}

function EditTemplateForm({
  template,
  onClose,
}: {
  template: TextTemplateSummary
  onClose: () => void
}) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<TextTemplateTranslations>(template.translations)

  const mutation = useMutation({
    mutationFn: (body: UpdateTextTemplateRequest) =>
      apiFetch<TextTemplateSummary>(`/v1/text-templates/${template.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
      onClose()
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ translations: values })
      }}
    >
      <h2 className="text-lg font-semibold">
        {t('admin.textTemplates.editTitle', { key: template.key })}
      </h2>
      <TranslationFields values={values} onChange={setValues} />
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.textTemplates.save')}
        </button>
        <button
          className="rounded border border-slate-600 px-4 py-2 font-medium text-slate-300"
          type="button"
          onClick={onClose}
        >
          {t('admin.textTemplates.cancel')}
        </button>
      </div>
    </form>
  )
}

function ArchiveButton({ template }: { template: TextTemplateSummary }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetch<TextTemplateSummary>(`/v1/text-templates/${template.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ archived }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
    },
  })

  return (
    <button
      className="rounded border border-slate-600 px-2 py-1 text-xs"
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(template.archivedAt === null)}
    >
      {template.archivedAt === null
        ? t('admin.textTemplates.archive')
        : t('admin.textTemplates.unarchive')}
    </button>
  )
}

function DeleteButton({ template }: { template: TextTemplateSummary }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/v1/text-templates/${template.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
    },
  })

  const blocked = template.usageCount > 0

  return (
    <div className="flex flex-col gap-1">
      <button
        className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 disabled:opacity-40"
        type="button"
        disabled={blocked || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('admin.textTemplates.delete')}
      </button>
      {blocked ? (
        <span className="text-xs text-slate-500">{t('admin.textTemplates.deleteBlocked')}</span>
      ) : null}
      {mutation.isError ? (
        <span role="alert" className="text-xs text-red-400">
          {errorMessage(t, mutation.error)}
        </span>
      ) : null}
    </div>
  )
}

export function TextTemplatesPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editing, setEditing] = useState<TextTemplateSummary | null>(null)
  const templates = useTextTemplates()

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

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.textTemplates.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        to="/admin"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.textTemplates.title')}</h1>
      <p className="mt-2 text-sm text-slate-400">{t('admin.textTemplates.hint')}</p>

      {templates.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, templates.error)}
        </p>
      ) : null}

      {canWrite ? (
        editing === null ? (
          <CreateTemplateForm />
        ) : (
          <EditTemplateForm template={editing} onClose={() => setEditing(null)} />
        )
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th>{t('admin.textTemplates.table.key')}</th>
              <th>{t('admin.textTemplates.table.de')}</th>
              <th>{t('admin.textTemplates.table.en')}</th>
              <th>{t('admin.textTemplates.table.status')}</th>
              <th>{t('admin.textTemplates.table.usage')}</th>
              {canWrite ? <th>{t('admin.textTemplates.table.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {alphabeticalTemplates(templates.data?.templates ?? []).map((template) => (
              <tr key={template.id} className="border-b border-slate-800 align-top">
                <td className="py-2 font-mono text-xs text-slate-400">{template.key}</td>
                <td className="py-2">{template.translations.de}</td>
                <td className="py-2">{template.translations.en}</td>
                <td className="py-2">
                  {template.archivedAt === null
                    ? t('admin.textTemplates.active')
                    : t('admin.textTemplates.archived')}
                </td>
                <td className="py-2">{template.usageCount}</td>
                {canWrite ? (
                  <td className="py-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <button
                        className="rounded border border-slate-600 px-2 py-1 text-xs"
                        type="button"
                        onClick={() => setEditing(template)}
                      >
                        {t('admin.textTemplates.edit')}
                      </button>
                      <ArchiveButton template={template} />
                      <DeleteButton template={template} />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
