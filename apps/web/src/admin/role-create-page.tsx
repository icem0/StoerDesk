import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type { CreateRoleRequest, RoleSummary } from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { apiFetch } from '../lib/api'
import {
  PermissionCheckboxes,
  errorMessage,
  jsonHeaders,
  toggleKey,
} from './role-form-parts'
import { AdminLayout } from '../components/admin-layout'

/**
 * The own page of the new role (WP-M14-159): the form does not lie below the
 * list of the roles any more, the list offers a button that opens this page.
 */
export function RoleCreatePage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canWrite = usePermission('role.write')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<CreateRoleRequest>({ key: '', permissionKeys: [] })

  const mutation = useMutation({
    mutationFn: (body: CreateRoleRequest) =>
      apiFetch<RoleSummary>('/v1/roles', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] })
      navigate('/admin/roles')
    },
  })

  if (me.isPending) {
    return <p>{t('admin.roles.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.roles.sessionNotice')}
      </p>
    )
  }

  if (!canWrite) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.roles.forbiddenNotice')}
      </p>
    )
  }

  return (
    <AdminLayout>
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/admin/roles"
      >
        {t('admin.roles.title')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.roles.createTitle')}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate(values)
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.roles.fields.key')}
          <input
            className="rounded bg-slate-900 p-2 text-slate-100"
            type="text"
            required
            value={values.key}
            onChange={(event) => setValues({ ...values, key: event.target.value })}
          />
        </label>
        <PermissionCheckboxes
          selected={values.permissionKeys}
          onToggle={(key) =>
            setValues({ ...values, permissionKeys: toggleKey(values.permissionKeys, key) })
          }
        />
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
          {t('admin.roles.create')}
        </button>
      </form>
    </AdminLayout>
  )
}
