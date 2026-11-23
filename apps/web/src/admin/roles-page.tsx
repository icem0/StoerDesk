import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type {
  RoleListResponse,
  RoleSummary,
  UpdateRoleRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { RowMenu } from '../components/row-menu'
import { apiFetch } from '../lib/api'
import {
  PermissionCheckboxes,
  errorMessage,
  jsonHeaders,
  toggleKey,
} from './role-form-parts'

function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<RoleListResponse>('/v1/roles'),
    retry: false,
  })
}

function EditRoleForm({ role }: { role: RoleSummary }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [permissionKeys, setPermissionKeys] = useState<string[]>(role.permissionKeys)

  const mutation = useMutation({
    mutationFn: (body: UpdateRoleRequest) =>
      apiFetch<RoleSummary>(`/v1/roles/${role.key}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })

  const deletion = useMutation({
    mutationFn: () => apiFetch(`/v1/roles/${role.key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate({ permissionKeys })
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.roles.editTitle', { key: role.key })}</h2>
      <PermissionCheckboxes
        selected={permissionKeys}
        onToggle={(key) => setPermissionKeys((current) => toggleKey(current, key))}
      />
      {mutation.isError || deletion.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage(t, mutation.isError ? mutation.error : deletion.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          className="rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
          type="submit"
          disabled={mutation.isPending}
        >
          {t('admin.roles.save')}
        </button>
        <button
          className="rounded border border-red-700 px-4 py-2 font-medium text-red-300 disabled:opacity-50"
          type="button"
          disabled={deletion.isPending}
          onClick={() => deletion.mutate()}
        >
          {t('admin.roles.delete')}
        </button>
      </div>
    </form>
  )
}

export function RolesPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('role.read')
  const canWrite = usePermission('role.write')
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null)

  const roles = useRoles()
  const editingRole = roles.data?.roles.find((role) => role.key === editingRoleKey) ?? null

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

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.roles.forbiddenNotice')}
      </p>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <Link
        className="text-sm text-accent-300 underline-offset-2 hover:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        to="/settings"
      >
        {t('admin.back')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.roles.title')}</h1>
      {canWrite ? (
        <Link
          className="mt-4 inline-block rounded bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          to="/admin/roles/new"
        >
          {t('admin.roles.createTitle')}
        </Link>
      ) : null}
      <p className="mt-2 text-sm text-slate-400">{t('admin.roles.systemHint')}</p>
      {roles.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, roles.error)}
        </p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.roles.table.key')}</th>
            <th>{t('admin.roles.table.kind')}</th>
            <th>{t('admin.roles.table.permissions')}</th>
            <th>{t('admin.roles.table.users')}</th>
            {canWrite ? <th>{t('admin.roles.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {(roles.data?.roles ?? []).map((role) => (
            <tr key={role.key} className="border-b border-slate-800">
              <td>{role.key}</td>
              <td>{role.isSystem ? t('admin.roles.system') : t('admin.roles.custom')}</td>
              <td>{role.permissionKeys.length}</td>
              <td>{role.userCount}</td>
              {canWrite ? (
                <td>
                  {role.key === 'admin' ? (
                    <span className="text-xs text-slate-400">{t('admin.roles.readOnly')}</span>
                  ) : (
                    <RowMenu
                      items={[
                        {
                          key: 'edit',
                          label: t('admin.roles.edit'),
                          onSelect: () =>
                            setEditingRoleKey(editingRoleKey === role.key ? null : role.key),
                        },
                      ]}
                    />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && editingRole && editingRole.key !== 'admin' ? (
        <EditRoleForm key={editingRole.key} role={editingRole} />
      ) : null}
    </main>
  )
}
