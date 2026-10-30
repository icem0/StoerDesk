import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PERMISSION_KEYS } from '@stoerdesk/shared'
import type {
  CreateRoleRequest,
  RoleListResponse,
  RoleSummary,
  UpdateRoleRequest,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

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

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.roles.errors.${code}`)
}

function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<RoleListResponse>('/v1/roles'),
    retry: false,
  })
}

function PermissionCheckboxes({
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

function toggleKey(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]
}

function CreateRoleForm() {
  const { t } = useTranslation('settings')
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
      setValues({ key: '', permissionKeys: [] })
    },
  })

  return (
    <form
      className="mt-6 flex flex-col gap-3 border-t border-slate-800 pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate(values)
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.roles.createTitle')}</h2>
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
        className="self-start rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        type="submit"
        disabled={mutation.isPending}
      >
        {t('admin.roles.create')}
      </button>
    </form>
  )
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
          className="rounded bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50"
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
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null)

  const roles = useRoles()

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
      <h1 className="text-2xl font-semibold">{t('admin.roles.title')}</h1>
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
                  {role.isSystem ? (
                    <span className="text-xs text-slate-400">{t('admin.roles.readOnly')}</span>
                  ) : (
                    <button
                      className="rounded border border-slate-600 px-2 py-1 text-xs"
                      type="button"
                      onClick={() => setEditingRole(editingRole?.key === role.key ? null : role)}
                    >
                      {t('admin.roles.edit')}
                    </button>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && editingRole && !editingRole.isSystem ? (
        <EditRoleForm role={editingRole} />
      ) : null}
      {canWrite ? <CreateRoleForm /> : null}
    </main>
  )
}
