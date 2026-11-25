import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  TextTemplateListResponse,
  TextTemplateSummary,
  TextTemplateTranslations,
  UpdateTextTemplateRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { apiFetch } from '../lib/api'
import { localizedName } from '../lib/localized-name'
import {
  TranslationFields,
  errorMessage,
  jsonHeaders,
} from './text-template-form-parts'
import { AdminLayout } from '../components/admin-layout'

/**
 * Fault type administration (`specs/06-report-form.md` §7.9, WP-M2-40c).
 *
 * The catalog of the report form: create a template with a German/English pair,
 * edit it, archive it (it disappears from the form but keeps labelling existing
 * tickets) and delete it only while no ticket carries it. The server enforces
 * `settings.read`/`settings.write`; the UI only hides what the role may not do.
 *
 * Since WP-M16-16 the list follows the rule of `specs/13-ui.md` §14.8
 * (ADR-0043): the row shows **one** name — the name of the language of the
 * interface — and the actions of the row sit behind one `…` button. The key and
 * the translation texts of every language stand together in the edit.
 */

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
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.textTemplates.fields.key')}
        <input
          className="rounded bg-slate-950 p-2 font-mono text-slate-100 read-only:opacity-60"
          readOnly
          value={template.key}
        />
      </label>
      <TranslationFields values={values} onChange={setValues} />
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
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

export function TextTemplatesPage() {
  const { t, i18n } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('settings.read')
  const canWrite = usePermission('settings.write')
  const [editing, setEditing] = useState<TextTemplateSummary | null>(null)
  const templates = useTextTemplates()
  const queryClient = useQueryClient()

  const archiveMutation = useMutation({
    mutationFn: (template: TextTemplateSummary) =>
      apiFetch<TextTemplateSummary>(`/v1/text-templates/${template.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ archived: template.archivedAt === null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (template: TextTemplateSummary) =>
      apiFetch(`/v1/text-templates/${template.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['text-templates'] })
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

  if (!canRead) {
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
        to="/settings"
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

      {deleteMutation.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, deleteMutation.error)}
        </p>
      ) : null}

      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          to="/admin/text-templates/new"
        >
          {t('admin.textTemplates.createTitle')}
        </Link>
      ) : null}

      {canWrite && editing ? (
        <EditTemplateForm template={editing} onClose={() => setEditing(null)} />
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th>{t('admin.textTemplates.table.name')}</th>
              <th>{t('admin.textTemplates.table.status')}</th>
              <th>{t('admin.textTemplates.table.usage')}</th>
              {canWrite ? <th>{t('admin.textTemplates.table.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {alphabeticalTemplates(templates.data?.templates ?? []).map((template) => {
              const blocked = template.usageCount > 0

              return (
                <tr key={template.id} className="border-b border-slate-800 align-top">
                  <td className="py-2" title={template.key}>
                    {localizedName(template.translations, i18n.language, template.key)}
                  </td>
                  <td className="py-2">
                    {template.archivedAt === null
                      ? t('admin.textTemplates.active')
                      : t('admin.textTemplates.archived')}
                  </td>
                  <td className="py-2">{template.usageCount}</td>
                  {canWrite ? (
                    <td className="py-2">
                      <RowMenu
                        items={[
                          {
                            key: 'edit',
                            label: t('admin.textTemplates.edit'),
                            onSelect: () => setEditing(template),
                          },
                          {
                            key: 'archive',
                            label:
                              template.archivedAt === null
                                ? t('admin.textTemplates.archive')
                                : t('admin.textTemplates.unarchive'),
                            onSelect: () => archiveMutation.mutate(template),
                          },
                          {
                            key: 'delete',
                            label: t('admin.textTemplates.delete'),
                            tone: 'danger',
                            disabled: blocked,
                            title: blocked ? t('admin.textTemplates.deleteBlocked') : undefined,
                            onSelect: () => deleteMutation.mutate(template),
                          },
                        ]}
                      />
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
