import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type {
  CreateUserRequest,
  RoleListResponse,
  UserListResponse,
  UserSummary,
} from '@stoerdesk/shared'

import { useMe, usePermission } from '../auth/usePermission'
import { ApiError, apiFetch } from '../lib/api'

type UserLocale = 'de' | 'en'

interface UserFormValues {
  email: string
  password: string
  locale: UserLocale
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
] as const

const jsonHeaders = { 'content-type': 'application/json' }

function errorMessage(t: TFunction<'settings'>, error: unknown): string {
  const code =
    error instanceof ApiError &&
    error.code !== undefined &&
    (handledErrorCodes as readonly string[]).includes(error.code)
      ? error.code
      : 'unknown'

  return t(`admin.users.errors.${code}`)
}

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UserListResponse>('/v1/users'),
    retry: false,
  })
}

function useRoles(enabled: boolean) {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<RoleListResponse>('/v1/roles'),
    retry: false,
    enabled,
  })
}

function RoleCheckboxes({
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
          {key}
        </label>
      ))}
    </fieldset>
  )
}

function CreateUserForm({ roleKeys }: { roleKeys: string[] }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<UserFormValues>({
    email: '',
    password: '',
    locale: 'de',
    active: true,
    roleKeys: [],
  })

  const mutation = useMutation({
    mutationFn: (body: CreateUserRequest) =>
      apiFetch<UserSummary>('/v1/users', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      setValues({ email: '', password: '', locale: 'de', active: true, roleKeys: [] })
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
      <h2 className="text-lg font-semibold">{t('admin.users.createTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.email')}
        <input
          className="rounded bg-slate-900 p-2 text-slate-100"
          type="email"
          required
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.password')}
        <input
          className="rounded bg-slate-900 p-2 text-slate-100"
          type="password"
          required
          minLength={12}
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.locale')}
        <select
          className="rounded bg-slate-900 p-2 text-slate-100"
          value={values.locale}
          onChange={(event) => setValues({ ...values, locale: event.target.value as UserLocale })}
        >
          <option value="de">{t('admin.users.locales.de')}</option>
          <option value="en">{t('admin.users.locales.en')}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(event) => setValues({ ...values, active: event.target.checked })}
        />
        {t('admin.users.fields.activeLabel')}
      </label>
      <RoleCheckboxes
        selected={values.roleKeys}
        roleKeys={roleKeys}
        onToggle={(key) =>
          setValues({
            ...values,
            roleKeys: values.roleKeys.includes(key)
              ? values.roleKeys.filter((entry) => entry !== key)
              : [...values.roleKeys, key],
          })
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
        {t('admin.users.create')}
      </button>
    </form>
  )
}

function EditUserForm({ user, roleKeys }: { user: UserSummary; roleKeys: string[] }) {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [values, setValues] = useState<UserFormValues>({
    email: user.email,
    password: '',
    locale: user.locale,
    active: user.active,
    roleKeys: user.roleKeys,
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<UserSummary>(`/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          locale: values.locale,
          active: values.active,
          roleKeys: values.roleKeys,
          ...(values.password === '' ? {} : { password: values.password }),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <h2 className="text-lg font-semibold">{t('admin.users.editTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.passwordNew')}
        <input
          className="rounded bg-slate-950 p-2 text-slate-100"
          type="password"
          minLength={12}
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('admin.users.fields.locale')}
        <select
          className="rounded bg-slate-950 p-2 text-slate-100"
          value={values.locale}
          onChange={(event) => setValues({ ...values, locale: event.target.value as UserLocale })}
        >
          <option value="de">{t('admin.users.locales.de')}</option>
          <option value="en">{t('admin.users.locales.en')}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(event) => setValues({ ...values, active: event.target.checked })}
        />
        {t('admin.users.fields.activeLabel')}
      </label>
      <RoleCheckboxes
        selected={values.roleKeys}
        roleKeys={roleKeys}
        onToggle={(key) =>
          setValues({
            ...values,
            roleKeys: values.roleKeys.includes(key)
              ? values.roleKeys.filter((entry) => entry !== key)
              : [...values.roleKeys, key],
          })
        }
      />
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
          {t('admin.users.save')}
        </button>
      </div>
    </form>
  )
}

export function UsersPage() {
  const { t } = useTranslation('settings')
  const me = useMe()
  const canRead = usePermission('user.read')
  const canWrite = usePermission('user.write')
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null)

  const users = useUsers()
  const roles = useRoles(canWrite)

  if (me.isPending) {
    return <p>{t('admin.users.loading')}</p>
  }

  if (me.isError) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.users.sessionNotice')}
      </p>
    )
  }

  if (!canRead) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        {t('admin.users.forbiddenNotice')}
      </p>
    )
  }

  const roleKeys = roles.data?.roles.map((role) => role.key) ?? []

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <h1 className="text-2xl font-semibold">{t('admin.users.title')}</h1>
      {users.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {errorMessage(t, users.error)}
        </p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th>{t('admin.users.table.email')}</th>
            <th>{t('admin.users.table.locale')}</th>
            <th>{t('admin.users.table.active')}</th>
            <th>{t('admin.users.table.roles')}</th>
            {canWrite ? <th>{t('admin.users.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {(users.data?.users ?? []).map((user) => (
            <tr key={user.id} className="border-b border-slate-800">
              <td>{user.email}</td>
              <td>{t(`admin.users.locales.${user.locale}`)}</td>
              <td>{user.active ? t('admin.users.active') : t('admin.users.inactive')}</td>
              <td>{user.roleKeys.join(', ')}</td>
              {canWrite ? (
                <td>
                  <button
                    className="rounded border border-slate-600 px-2 py-1 text-xs"
                    type="button"
                    onClick={() => setEditingUser(editingUser?.id === user.id ? null : user)}
                  >
                    {t('admin.users.edit')}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && editingUser ? <EditUserForm user={editingUser} roleKeys={roleKeys} /> : null}
      {canWrite ? <CreateUserForm roleKeys={roleKeys} /> : null}
    </main>
  )
}
