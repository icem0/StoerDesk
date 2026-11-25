import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type { CreateGroupRequest, GroupSummary } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import { errorMessage, jsonHeaders } from './group-form-parts'
import { AdminLayout } from '../components/admin-layout'

/**
 * The own page of the new group (WP-M14-160): the form does not lie below the
 * list of the groups any more, the list offers a button that opens this page.
 */
export function GroupCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('user.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: (body: CreateGroupRequest) =>
      apiFetch<GroupSummary>('/v1/groups', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate('/admin/groups')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.groups.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.groups.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.groups.forbiddenNotice')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/groups"
      >
        {t('admin.groups.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.groups.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate({ name })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.groups.fields.name')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="text"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
          {t('admin.groups.create')}
        </button>
      </form>
    </AdminLayout>
  )
}
